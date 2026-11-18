using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Users.Events;

/// <summary>An admin pre-created a user before their first login (USR-2). Audited as <c>user.created</c>.</summary>
/// <param name="UserId">The new user's id.</param>
/// <param name="Username">The new user's username (audit target name).</param>
/// <param name="Role">The role the admin chose.</param>
/// <param name="IsReadOnly">Whether the user was created globally read-only.</param>
public sealed record UserCreated(UserId UserId, string Username, UserRole Role, bool IsReadOnly) : IDomainEvent;
