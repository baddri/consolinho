using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Users.Events;

/// <summary>An admin reactivated a deactivated user (USR-4); their grants apply again. Audited as <c>user.reactivated</c>.</summary>
/// <param name="UserId">The user's id.</param>
/// <param name="Username">The user's username.</param>
public sealed record UserReactivated(UserId UserId, string Username) : IDomainEvent;
