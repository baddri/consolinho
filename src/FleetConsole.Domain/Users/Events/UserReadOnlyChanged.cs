using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Users.Events;

/// <summary>An admin switched a user's global read-only flag (USR-5). Audited as <c>user.read_only_changed</c>.</summary>
/// <param name="UserId">The user's id.</param>
/// <param name="Username">The user's username.</param>
/// <param name="IsReadOnly">The new value of the flag.</param>
public sealed record UserReadOnlyChanged(UserId UserId, string Username, bool IsReadOnly) : IDomainEvent;
