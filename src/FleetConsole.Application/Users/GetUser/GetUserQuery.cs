using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Users.GetUser;

/// <summary>
/// Reads one user for the Administration detail page (USR-1, <c>GET /api/admin/users/{username}</c>). The user
/// endpoints also dispatch it after a successful command, so their response carries the post-commit <c>version</c>
/// (ADR-0013 §5).
/// </summary>
/// <param name="Username">The username from the route (exact, case-sensitive).</param>
public sealed record GetUserQuery(string Username) : IQuery<UserDetailDto>, IAdminRequest;
