using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Audit;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.Options;

namespace FleetConsole.Application.Auth.CompleteLogin;

/// <summary>
/// Handles <see cref="CompleteLoginCommand"/>: provision / refuse / record the login of an OpenShift user.
/// </summary>
/// <remarks>
/// <para>Flow: parse the username (unusable → <see cref="LoginDecision.NotRegistered"/>) → load the user →</para>
/// <list type="bullet">
/// <item>missing and <see cref="AuthOptions.AutoProvision"/> → <c>User.Provision</c> + record the login (AUTH-5);</item>
/// <item>missing otherwise → <c>auth.login_denied</c> (<c>notRegistered</c>, anonymous actor) (AUTH-6);</item>
/// <item>deactivated → <c>auth.login_denied</c> (<c>deactivated</c>, the user as actor) (AUTH-7);</item>
/// <item>else → record the login (AUTH-8: configuration admin source recomputed).</item>
/// </list>
/// <para>Recording the login raises <c>UserLoggedIn</c> (and <c>UserRoleChanged</c> from configuration when the role
/// changes); their audit entries are written by <c>UserAuditHandler</c> with explicit actors, so this command saves
/// without a session. Denials are recorded here directly and returned as success (ADR-0008 §4).</para>
/// <para>The login has just read the user's groups (<c>users/~</c>), so the check time is recorded too
/// (<see cref="IUserGroupCheckRecorder"/>, ADR-0039 §3); revalidation keeps them current afterwards.</para>
/// <para>Virtual <c>system:*</c> groups are dropped before anything is stored or evaluated (<see cref="OpenShiftGroups"/>).</para>
/// <para>Two first logins of the same new user racing each other: the second fails the unique index at commit and
/// <c>UnitOfWorkBehavior</c> returns <c>Persistence.DuplicateKey</c>; the Api treats it as a failed login and a retry
/// succeeds.</para>
/// </remarks>
internal sealed class CompleteLoginHandler(
    IUserRepository users,
    IUserGroupCheckRecorder groupChecks,
    IAuditTrail auditTrail,
    IClock clock,
    IOptions<AuthOptions> options) : IRequestHandler<CompleteLoginCommand, Result<LoginOutcomeDto>>
{
    /// <summary>Stand-in actor/target name for an identity without a usable username (never expected from OpenShift).</summary>
    private const string UnknownUsername = "(unknown)";

    /// <inheritdoc />
    public async Task<Result<LoginOutcomeDto>> Handle(CompleteLoginCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var identity = request.Identity;
        var settings = options.Value;

        var username = Username.Create(identity.Username);
        if (username.IsFailure)
        {
            // OpenShift never reports such a name; refusing it like an unknown user keeps the outcome explainable.
            return DenyUnregistered(AuditName(identity.Username));
        }

        var user = await users.GetByUsernameAsync(username.Value, cancellationToken).ConfigureAwait(false);
        var now = clock.UtcNow;
        var provisioned = false;

        if (user is null)
        {
            if (!settings.AutoProvision)
            {
                return DenyUnregistered(username.Value.Value);
            }

            user = User.Provision(username.Value, now);
            users.Add(user);
            provisioned = true;
        }
        else if (user.IsDeactivated)
        {
            return DenyDeactivated(user);
        }

        var groups = OpenShiftGroups.WithoutVirtualGroups(identity.Groups);
        var adminSource = AdminConfigurationResolver.Resolve(user.Username.Value, groups, settings);
        var login = user.RecordLogin(identity.FullName, groups, adminSource, provisioned, now);
        if (login.IsFailure)
        {
            // Unreachable: RecordLogin fails only for deactivated users, handled above. Fail loudly if that changes.
            throw new InvalidOperationException($"Recording the login failed unexpectedly: {login.Error.Code}.");
        }

        await groupChecks.RecordAsync(user.Id, now, cancellationToken).ConfigureAwait(false);

        return new LoginOutcomeDto(
            LoginDecision.Allowed,
            new SignedInUserDto(user.Id, user.Username.Value, user.Role, user.IsReadOnly, user.SecurityStamp));
    }

    private LoginOutcomeDto DenyUnregistered(string claimedUsername)
    {
        // T-0013 convention: no FleetConsole user → no target id, anonymous actor named after the claimed username.
        auditTrail.Record(new AuditRecord(
            AuthAuditActions.LoginDenied,
            AuditTargetType.Session,
            TargetId: null,
            TargetName: claimedUsername,
            ClusterName: null,
            Summary: $"Login denied for {claimedUsername}: not registered",
            Details: new { reason = "notRegistered" },
            Actor: AuditActor.Anonymous(claimedUsername)));
        return new LoginOutcomeDto(LoginDecision.NotRegistered, User: null);
    }

    private LoginOutcomeDto DenyDeactivated(User user)
    {
        var name = user.Username.Value;
        auditTrail.Record(new AuditRecord(
            AuthAuditActions.LoginDenied,
            AuditTargetType.Session,
            TargetId: user.Id.Value.ToString(),
            TargetName: name,
            ClusterName: null,
            Summary: $"Login denied for {name}: deactivated",
            Details: new { reason = "deactivated" },
            Actor: AuditActor.ForUser(user.Id, name)));
        return new LoginOutcomeDto(LoginDecision.Deactivated, User: null);
    }

    /// <summary>A non-blank, bounded name for the audit entry of an unusable username.</summary>
    private static string AuditName(string? claimed) =>
        string.IsNullOrWhiteSpace(claimed)
            ? UnknownUsername
            : claimed.Length > Username.MaxLength ? claimed[..Username.MaxLength] : claimed;
}
