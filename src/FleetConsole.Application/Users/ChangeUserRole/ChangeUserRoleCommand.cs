using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Users.ChangeUserRole;

/// <summary>
/// Promotes or demotes a user by assignment (USR-3, <c>PUT /api/admin/users/{username}/role</c>). Promote records the
/// assignment also for a user who is admin only through configuration (ADR-0017); demote is refused for configuration
/// admins, for the acting admin and for the last active writable admin (ADM-5). Audited as <c>user.promoted</c> /
/// <c>user.demoted</c>; a repeat is a no-op without an entry.
/// </summary>
/// <remarks>Returns the username; the endpoint re-reads the user for the response body.</remarks>
/// <param name="Username">The user from the route.</param>
/// <param name="Role">The requested role.</param>
/// <param name="Version">The user's <c>version</c> the client last saw (optimistic concurrency).</param>
public sealed record ChangeUserRoleCommand(string Username, UserRole Role, uint Version)
    : ICommand<string>, IAdminRequest, IMutatingCommand;
