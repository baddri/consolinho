namespace FleetConsole.Domain.Users;

/// <summary>
/// Why a user's effective role changed, carried by <see cref="Events.UserRoleChanged"/>. The audit trail uses it to pick
/// the actor: <see cref="Manual"/> changes are attributed to the acting admin, <see cref="Configuration"/> changes to
/// <c>system (config)</c> (ADR-0009, AUTH-8).
/// </summary>
public enum RoleChangeSource
{
    /// <summary>An admin promoted or demoted the user explicitly (<see cref="User.ChangeRole"/>).</summary>
    Manual = 0,

    /// <summary>The admin configuration (bootstrap user list or admin groups) evaluated at login changed the role.</summary>
    Configuration = 1,
}
