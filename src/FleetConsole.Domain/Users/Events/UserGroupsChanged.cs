using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Users.Events;

/// <summary>
/// Session revalidation found that a user's host group memberships differ from the recorded ones (ADR-0039), so group
/// grants now apply differently. Audited as <c>user.groups_changed</c> with the system actor <c>system (revalidation)</c>.
/// Login refreshes groups too but reports them on <see cref="UserLoggedIn"/> instead.
/// </summary>
/// <param name="UserId">The user's id.</param>
/// <param name="Username">The user's username.</param>
/// <param name="Added">Groups the user is now a member of but wasn't before (ordinal, in the new list's order).</param>
/// <param name="Removed">Groups the user is no longer a member of (ordinal, in the old list's order).</param>
public sealed record UserGroupsChanged(
    UserId UserId,
    string Username,
    IReadOnlyList<string> Added,
    IReadOnlyList<string> Removed) : IDomainEvent;
