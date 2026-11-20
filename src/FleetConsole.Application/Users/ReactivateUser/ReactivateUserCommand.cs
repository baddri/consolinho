using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Users.ReactivateUser;

/// <summary>
/// Reactivates a deactivated user (USR-4, <c>POST /api/admin/users/{username}/reactivate</c>): they can log in again
/// and their kept grants apply again. Sessions from before the deactivation stay invalid (the security stamp is not
/// restored, ADR-0009). Audited as <c>user.reactivated</c>; a repeat is a no-op without an entry.
/// </summary>
/// <remarks>Returns the username; the endpoint re-reads the user for the response body.</remarks>
/// <param name="Username">The user from the route.</param>
/// <param name="Version">The user's <c>version</c> the client last saw (optimistic concurrency).</param>
public sealed record ReactivateUserCommand(string Username, uint Version)
    : ICommand<string>, IAdminRequest, IMutatingCommand;
