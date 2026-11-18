using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Users.Events;

/// <summary>
/// An admin deactivated a user (USR-4). The security stamp was rotated, so the user's sessions end at their next
/// revalidation. Audited as <c>user.deactivated</c>.
/// </summary>
/// <param name="UserId">The user's id.</param>
/// <param name="Username">The user's username.</param>
public sealed record UserDeactivated(UserId UserId, string Username) : IDomainEvent;
