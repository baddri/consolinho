using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Users.Events;

/// <summary>
/// A user's role changed, either by an admin or because the admin configuration evaluated at login changed
/// (ADR-0009). Audited as <c>user.promoted</c> / <c>user.demoted</c> chosen by <see cref="NewRole"/>; configuration
/// changes use the actor <c>system (config)</c>. <see cref="OldRole"/> can equal <see cref="NewRole"/>: an admin
/// promoting a user who is already admin through configuration records the assignment (ADR-0017).
/// </summary>
/// <param name="UserId">The user's id.</param>
/// <param name="Username">The user's username.</param>
/// <param name="OldRole">The effective role before the change.</param>
/// <param name="NewRole">The effective role after the change.</param>
/// <param name="Source">Who caused the change.</param>
/// <param name="ConfigurationSource">For <see cref="RoleChangeSource.Configuration"/>: the configuration source that
/// caused it (the new source on promotion, the former one on demotion), e.g. <c>"group fleetconsole-admins"</c>. For
/// <see cref="RoleChangeSource.Manual"/>: the user's admin configuration source at the time of the change, which is
/// non-null only when an admin promotes a configuration admin (ADR-0017).</param>
public sealed record UserRoleChanged(
    UserId UserId,
    string Username,
    UserRole OldRole,
    UserRole NewRole,
    RoleChangeSource Source,
    string? ConfigurationSource) : IDomainEvent;
