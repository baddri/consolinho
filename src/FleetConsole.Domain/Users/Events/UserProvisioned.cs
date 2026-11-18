using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Users.Events;

/// <summary>
/// An unknown OpenShift user was created automatically at their first login (AUTH-5, auto-provisioning). Audited as
/// <c>user.provisioned</c> with the user as actor.
/// </summary>
/// <param name="UserId">The new user's id.</param>
/// <param name="Username">The new user's username.</param>
public sealed record UserProvisioned(UserId UserId, string Username) : IDomainEvent;
