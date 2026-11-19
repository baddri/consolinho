using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Users.DeactivateUser;

/// <summary>
/// Deactivates a user (USR-4, <c>POST /api/admin/users/{username}/deactivate</c>): login is refused from now on and the
/// security stamp is rotated, so the user's sessions end within <c>Auth:RevalidationInterval</c>. Grants are kept.
/// Refused for the acting admin and for the last active writable admin (ADM-5). Audited as <c>user.deactivated</c>; a
/// repeat is a no-op without an entry.
/// </summary>
/// <remarks>Returns the username; the endpoint re-reads the user for the response body.</remarks>
/// <param name="Username">The user from the route.</param>
/// <param name="Version">The user's <c>version</c> the client last saw (optimistic concurrency).</param>
public sealed record DeactivateUserCommand(string Username, uint Version)
    : ICommand<string>, IAdminRequest, IMutatingCommand;
