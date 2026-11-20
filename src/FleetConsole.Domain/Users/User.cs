using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users.Events;

namespace FleetConsole.Domain.Users;

/// <summary>
/// A person who may log in to FleetConsole, identified by their OpenShift username. The aggregate owns everything that
/// decides whether and how the user may act: the effective <see cref="Role"/>, the global <see cref="IsReadOnly"/>
/// flag, deactivation, and the <see cref="SecurityStamp"/> that ends sessions. Cluster access is not here: grants
/// reference users by <see cref="UserId"/>.
/// </summary>
/// <remarks>
/// <para><b>Two admin sources (ADR-0009).</b> <see cref="IsAdminByAssignment"/> is set and cleared by admins;
/// <see cref="AdminConfigurationSource"/> is recomputed from configuration at every login. The effective role is
/// Admin when either is set, so an admin who was also promoted explicitly stays admin when removed from the configured
/// admin group, and a configuration admin cannot be demoted through the UI.</para>
/// <para><b>Last-admin protection (ADM-5).</b> Methods that could remove the last active, writable admin take the
/// current number of such admins (<see cref="IsActiveWritableAdmin"/>, counted by the handler from the database,
/// including this user) and refuse when this user is one of them and the count is at most one.</para>
/// <para><b>Idempotency.</b> Transitions to the current state succeed without raising an event, so they produce no
/// audit entry (contract §1). For promotion the "state" is <see cref="IsAdminByAssignment"/>, not the effective role:
/// promoting a user who is admin only through configuration records the assignment (ADR-0017).</para>
/// </remarks>
public sealed class User : AggregateRoot<UserId>
{
    /// <summary>Parameterless constructor for EF Core materialization only.</summary>
    private User()
    {
    }

    private User(UserId id, Username username, string createdBy, DateTimeOffset createdAt)
        : base(id)
    {
        Username = username;
        CreatedBy = createdBy;
        CreatedAt = createdAt;
        SecurityStamp = Guid.NewGuid();
    }

    /// <summary>The OpenShift username: the natural key, unique and immutable.</summary>
    public Username Username { get; private init; } = null!;

    /// <summary>The OpenShift <c>fullName</c> reported at the last login, or <see langword="null"/> if none was set.</summary>
    public string? DisplayName { get; private set; }

    /// <summary>Whether an admin promoted this user explicitly (or pre-created them as admin). Cleared by demotion.</summary>
    public bool IsAdminByAssignment { get; private set; }

    /// <summary>
    /// Why configuration makes this user an admin, as computed at the last login: <c>"user list"</c>
    /// (<c>Auth:BootstrapAdminUsers</c>), <c>"group &lt;name&gt;"</c> (first matching <c>Auth:AdminGroups</c> entry),
    /// or <see langword="null"/>. Shown in the UI as "Admin via configuration" (USR-6).
    /// </summary>
    public string? AdminConfigurationSource { get; private set; }

    /// <summary>The effective role: Admin when assigned by an admin <em>or</em> granted by configuration. Not persisted.</summary>
    public UserRole Role => IsAdminByAssignment || AdminConfigurationSource is not null ? UserRole.Admin : UserRole.User;

    /// <summary>
    /// Global read-only flag (USR-5): blocks admin commands for admins (ADM-2) and, from CP2, cluster mutations on
    /// every cluster regardless of grant mode.
    /// </summary>
    public bool IsReadOnly { get; private set; }

    /// <summary>Whether an admin deactivated the user: login is refused (AUTH-7) and sessions end.</summary>
    public bool IsDeactivated { get; private set; }

    /// <summary>
    /// Lifecycle state for the UI (USR-1), derived with the precedence deactivated, then pending (never logged in),
    /// then active. Not persisted.
    /// </summary>
    public UserStatus Status => IsDeactivated
        ? UserStatus.Deactivated
        : LastLoginAt is null ? UserStatus.Pending : UserStatus.Active;

    /// <summary>When the user last logged in successfully; <see langword="null"/> until the first login.</summary>
    public DateTimeOffset? LastLoginAt { get; private set; }

    /// <summary>The OpenShift groups reported at the last login (informational; empty before the first login).</summary>
    public IReadOnlyList<string> Groups { get; private set; } = [];

    /// <summary>
    /// Copied into the session cookie (<c>fc:stamp</c>) at login. Session revalidation rejects a session whose stamp
    /// differs, so rotating it ends every existing session (ADR-0009). Rotated by <see cref="Deactivate"/>; reactivation
    /// does not restore it.
    /// </summary>
    public Guid SecurityStamp { get; private set; }

    /// <summary>When the user record was created (pre-created or auto-provisioned).</summary>
    public DateTimeOffset CreatedAt { get; private init; }

    /// <summary>Who created the record: the pre-creating admin's username, or the user's own name when auto-provisioned.</summary>
    public string CreatedBy { get; private init; } = null!;

    /// <summary>
    /// Whether this user counts for last-admin protection (ADM-5): an admin who is neither deactivated nor read-only, i.e.
    /// someone who can still perform admin changes.
    /// </summary>
    public bool IsActiveWritableAdmin => Role == UserRole.Admin && !IsDeactivated && !IsReadOnly;

    /// <summary>
    /// Pre-creates a user before their first login (USR-2). The user is <see cref="UserStatus.Pending"/> until
    /// <see cref="RecordLogin"/>. Raises <see cref="UserCreated"/>.
    /// </summary>
    /// <param name="username">The OpenShift username; uniqueness is checked by the handler.</param>
    /// <param name="role">Initial role; <see cref="UserRole.Admin"/> sets <see cref="IsAdminByAssignment"/>.</param>
    /// <param name="isReadOnly">Initial global read-only flag.</param>
    /// <param name="createdBy">Username of the acting admin.</param>
    /// <param name="now">Current time (from <c>IClock</c>).</param>
    /// <returns>The new user.</returns>
    public static User PreCreate(Username username, UserRole role, bool isReadOnly, string createdBy, DateTimeOffset now)
    {
        Guard.NotNull(username);
        Guard.NotNullOrWhiteSpace(createdBy);
        Guard.NotDefault(now);
        if (!Enum.IsDefined(role))
        {
            throw new ArgumentOutOfRangeException(nameof(role), role, "Unknown user role.");
        }

        var user = new User(UserId.New(), username, createdBy, now)
        {
            IsAdminByAssignment = role == UserRole.Admin,
            IsReadOnly = isReadOnly,
        };
        user.RaiseDomainEvent(new UserCreated(user.Id, username.Value, user.Role, isReadOnly));
        return user;
    }

    /// <summary>
    /// Creates a user automatically at their first login (AUTH-5): a regular, writable user created by themselves.
    /// Raises <see cref="UserProvisioned"/>; the caller then calls <see cref="RecordLogin"/> with
    /// <c>provisioned: true</c>, which may also make the user admin through configuration.
    /// </summary>
    /// <param name="username">The OpenShift username from the OAuth callback.</param>
    /// <param name="now">Current time (from <c>IClock</c>).</param>
    /// <returns>The new user.</returns>
    public static User Provision(Username username, DateTimeOffset now)
    {
        Guard.NotNull(username);
        Guard.NotDefault(now);

        var user = new User(UserId.New(), username, username.Value, now);
        user.RaiseDomainEvent(new UserProvisioned(user.Id, username.Value));
        return user;
    }

    /// <summary>
    /// Records a successful OpenShift login: refreshes display name and groups, recomputes the configuration admin source
    /// and stamps <see cref="LastLoginAt"/>. Raises <see cref="UserLoggedIn"/>, and additionally
    /// <see cref="UserRoleChanged"/> (source <see cref="RoleChangeSource.Configuration"/>) when the effective role changed
    /// because the configuration source appeared or disappeared.
    /// </summary>
    /// <param name="displayName">The OCP <c>fullName</c>; blank values are stored as <see langword="null"/>.</param>
    /// <param name="groups">The OCP groups of the user at this login.</param>
    /// <param name="adminConfigurationSource">The configuration source that makes the user admin, or
    /// <see langword="null"/>; see <see cref="AdminConfigurationSource"/>.</param>
    /// <param name="provisioned">Whether this login just auto-provisioned the user (carried into the audit entry).</param>
    /// <param name="now">Current time (from <c>IClock</c>).</param>
    /// <returns>Success, or <see cref="UserErrors.Deactivated"/> when the user is deactivated (AUTH-7); nothing changes
    /// then.</returns>
    public Result RecordLogin(
        string? displayName,
        IReadOnlyList<string> groups,
        string? adminConfigurationSource,
        bool provisioned,
        DateTimeOffset now)
    {
        Guard.NotNull(groups);
        Guard.NotDefault(now);

        if (IsDeactivated)
        {
            return UserErrors.Deactivated();
        }

        var oldRole = Role;
        var oldConfigurationSource = AdminConfigurationSource;

        DisplayName = string.IsNullOrWhiteSpace(displayName) ? null : displayName;
        Groups = [.. groups];
        AdminConfigurationSource = string.IsNullOrWhiteSpace(adminConfigurationSource) ? null : adminConfigurationSource;
        LastLoginAt = now;

        RaiseDomainEvent(new UserLoggedIn(Id, Username.Value, Groups, provisioned));
        if (Role != oldRole)
        {
            // Only the configuration source can have changed the effective role here. Report the source responsible:
            // the new one when it promoted the user, the former one when its removal demoted them.
            RaiseDomainEvent(new UserRoleChanged(
                Id, Username.Value, oldRole, Role, RoleChangeSource.Configuration,
                AdminConfigurationSource ?? oldConfigurationSource));
        }

        return Result.Success();
    }

    /// <summary>
    /// Promotes or demotes the user by assignment (USR-3), raising <see cref="UserRoleChanged"/> (source
    /// <see cref="RoleChangeSource.Manual"/>, <c>ConfigurationSource</c> = the current
    /// <see cref="AdminConfigurationSource"/>).
    /// </summary>
    /// <remarks>
    /// <para><b>Promote</b> sets <see cref="IsAdminByAssignment"/> whenever it is not set yet, also for a user who is
    /// already admin through configuration (ADR-0017): the event then has <c>OldRole == NewRole == Admin</c> and carries
    /// the configuration source, and the user stays admin after leaving the configured group. Promoting a user who is
    /// already admin by assignment succeeds without a change or event.</para>
    /// <para><b>Demote</b> succeeds without a change or event when the effective role is already
    /// <see cref="UserRole.User"/>. Otherwise it clears the assignment and is refused, in this order, while configuration
    /// makes the user admin, for the acting admin themselves, and for the last active writable admin.</para>
    /// </remarks>
    /// <param name="role">The requested role.</param>
    /// <param name="actingUserId">The admin performing the change.</param>
    /// <param name="activeWritableAdminCount">Number of users (including this one) for which
    /// <see cref="IsActiveWritableAdmin"/> is true.</param>
    /// <returns>Success, or <see cref="UserErrors.AdminViaConfiguration"/>, <see cref="UserErrors.SelfChange"/>,
    /// <see cref="UserErrors.LastAdmin"/>.</returns>
    public Result ChangeRole(UserRole role, UserId actingUserId, int activeWritableAdminCount)
    {
        Guard.NotDefault(actingUserId);
        Guard.InRange(activeWritableAdminCount, 0, int.MaxValue);
        if (!Enum.IsDefined(role))
        {
            throw new ArgumentOutOfRangeException(nameof(role), role, "Unknown user role.");
        }

        var oldRole = Role;
        if (role == UserRole.Admin)
        {
            // Idempotency is judged on the assignment, not the effective role: a configuration-only admin still gets
            // the assignment recorded so the role survives leaving the configured group (ADR-0017).
            if (IsAdminByAssignment)
            {
                return Result.Success();
            }
        }
        else
        {
            if (oldRole == UserRole.User)
            {
                return Result.Success();
            }

            if (AdminConfigurationSource is not null)
            {
                return UserErrors.AdminViaConfiguration(AdminConfigurationSource);
            }

            if (actingUserId == Id)
            {
                return UserErrors.SelfChange();
            }

            if (WouldRemoveLastAdmin(activeWritableAdminCount))
            {
                return UserErrors.LastAdmin(Username.Value);
            }
        }

        IsAdminByAssignment = role == UserRole.Admin;
        // The configuration source is non-null only when promoting a configuration admin: demote is refused while it is set.
        RaiseDomainEvent(new UserRoleChanged(
            Id, Username.Value, oldRole, Role, RoleChangeSource.Manual, AdminConfigurationSource));
        return Result.Success();
    }

    /// <summary>
    /// Sets the global read-only flag (USR-5). Making the last active writable admin read-only is refused, because no one
    /// could then undo it. Raises <see cref="UserReadOnlyChanged"/> unless the flag already has that value.
    /// </summary>
    /// <param name="isReadOnly">The requested value.</param>
    /// <param name="activeWritableAdminCount">Number of users (including this one) for which
    /// <see cref="IsActiveWritableAdmin"/> is true.</param>
    /// <returns>Success, or <see cref="UserErrors.LastAdmin"/>.</returns>
    public Result SetReadOnly(bool isReadOnly, int activeWritableAdminCount)
    {
        Guard.InRange(activeWritableAdminCount, 0, int.MaxValue);

        if (IsReadOnly == isReadOnly)
        {
            return Result.Success();
        }

        if (isReadOnly && WouldRemoveLastAdmin(activeWritableAdminCount))
        {
            return UserErrors.LastAdmin(Username.Value);
        }

        IsReadOnly = isReadOnly;
        RaiseDomainEvent(new UserReadOnlyChanged(Id, Username.Value, isReadOnly));
        return Result.Success();
    }

    /// <summary>
    /// Deactivates the user (USR-4): login is refused from now on and the <see cref="SecurityStamp"/> is rotated so
    /// existing sessions end at their next revalidation. Grants are kept. Refused for the acting admin themselves and for
    /// the last active writable admin. Raises <see cref="UserDeactivated"/> unless already deactivated.
    /// </summary>
    /// <param name="actingUserId">The admin performing the change.</param>
    /// <param name="activeWritableAdminCount">Number of users (including this one) for which
    /// <see cref="IsActiveWritableAdmin"/> is true.</param>
    /// <returns>Success, or <see cref="UserErrors.SelfChange"/>, <see cref="UserErrors.LastAdmin"/>.</returns>
    public Result Deactivate(UserId actingUserId, int activeWritableAdminCount)
    {
        Guard.NotDefault(actingUserId);
        Guard.InRange(activeWritableAdminCount, 0, int.MaxValue);

        if (IsDeactivated)
        {
            return Result.Success();
        }

        if (actingUserId == Id)
        {
            return UserErrors.SelfChange();
        }

        if (WouldRemoveLastAdmin(activeWritableAdminCount))
        {
            return UserErrors.LastAdmin(Username.Value);
        }

        IsDeactivated = true;
        SecurityStamp = Guid.NewGuid();
        RaiseDomainEvent(new UserDeactivated(Id, Username.Value));
        return Result.Success();
    }

    /// <summary>
    /// Reactivates a deactivated user (USR-4); their existing grants apply again. The security stamp is <em>not</em>
    /// restored, so sessions from before the deactivation stay invalid. Raises <see cref="UserReactivated"/> unless the
    /// user is already active.
    /// </summary>
    /// <returns>Always success (reactivation has no failure cases); a <see cref="Result"/> keeps transitions uniform.</returns>
    public Result Reactivate()
    {
        if (!IsDeactivated)
        {
            return Result.Success();
        }

        IsDeactivated = false;
        RaiseDomainEvent(new UserReactivated(Id, Username.Value));
        return Result.Success();
    }

    /// <summary>
    /// ADM-5 rule shared by the transitions that can take away admin capability: it applies only when this user currently
    /// counts as an active writable admin and no other such admin would remain.
    /// </summary>
    private bool WouldRemoveLastAdmin(int activeWritableAdminCount) =>
        IsActiveWritableAdmin && activeWritableAdminCount <= 1;
}
