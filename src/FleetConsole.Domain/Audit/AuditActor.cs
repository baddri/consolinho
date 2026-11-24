using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;

namespace FleetConsole.Domain.Audit;

/// <summary>
/// Who performed an audited action. Stored by value on the <see cref="AuditEntry"/> (the name as it was at the time),
/// so the log stays readable even if the user is later renamed or removed.
/// </summary>
/// <param name="UserId">The acting user's id, or <see langword="null"/> for system and anonymous actors.</param>
/// <param name="Name">Display name of the actor: a username, <c>system (config)</c> or <c>system (revalidation)</c>.</param>
/// <param name="IsSystem">True when FleetConsole itself acted (e.g. a role change from configuration at login).</param>
public sealed record AuditActor(UserId? UserId, string Name, bool IsSystem)
{
    /// <summary>Display name of the configuration actor.</summary>
    public const string ConfigurationName = "system (config)";

    /// <summary>Display name of the session-revalidation actor.</summary>
    public const string RevalidationName = "system (revalidation)";

    /// <summary>Display name of the actor, never blank.</summary>
    public string Name { get; } = Guard.NotNullOrWhiteSpace(Name);

    /// <summary>
    /// The configuration acting on a user at login (AUTH-8): admin role granted or removed because of
    /// <c>Auth:BootstrapAdminUsers</c> / <c>Auth:AdminGroups</c> (ADR-0009).
    /// </summary>
    public static AuditActor Configuration { get; } = new(null, ConfigurationName, IsSystem: true);

    /// <summary>
    /// Session revalidation acting on a user (ADR-0039): e.g. recording host group memberships that changed since the
    /// last login.
    /// </summary>
    public static AuditActor Revalidation { get; } = new(null, RevalidationName, IsSystem: true);

    /// <summary>A known FleetConsole user acting (the common case: an admin command, or the user's own login).</summary>
    /// <param name="id">The acting user's id.</param>
    /// <param name="username">The acting user's username.</param>
    /// <returns>A user actor.</returns>
    public static AuditActor ForUser(UserId id, string username) =>
        new(Guard.NotDefault(id), username, IsSystem: false);

    /// <summary>
    /// Someone who authenticated with OpenShift but is not a FleetConsole user (denied login with auto-provisioning
    /// off, AUTH-6). The name is the username OpenShift reported; there is no user id.
    /// </summary>
    /// <param name="claimedUsername">The OpenShift username of the login attempt.</param>
    /// <returns>An anonymous actor.</returns>
    public static AuditActor Anonymous(string claimedUsername) => new(null, claimedUsername, IsSystem: false);
}
