using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Users.SetUserReadOnly;

/// <summary>
/// Sets or clears a user's global read-only flag (USR-5, <c>PUT /api/admin/users/{username}/read-only</c>). Refused
/// only when it would leave no active writable admin (ADM-5, <c>Users.LastAdmin</c>; pending admins count as active).
/// Unlike demote/deactivate there is no self-change rule: an admin may make themselves read-only (contract §7.2).
/// Audited as <c>user.read_only_changed</c>; a repeat is a no-op without an entry.
/// </summary>
/// <remarks>Returns the username; the endpoint re-reads the user for the response body.</remarks>
/// <param name="Username">The user from the route.</param>
/// <param name="IsReadOnly">The requested value.</param>
/// <param name="Version">The user's <c>version</c> the client last saw (optimistic concurrency).</param>
public sealed record SetUserReadOnlyCommand(string Username, bool IsReadOnly, uint Version)
    : ICommand<string>, IAdminRequest, IMutatingCommand;
