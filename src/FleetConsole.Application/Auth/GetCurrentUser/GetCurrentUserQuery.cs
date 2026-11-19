using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Auth.GetCurrentUser;

/// <summary>
/// Describes the signed-in user for the SPA (AUTH-9, <c>GET /api/auth/me</c>, contract §4.4): name, role, read-only
/// flag, groups and whether configuration makes them admin.
/// </summary>
/// <remarks>
/// Role and read-only come from the session (refreshed by revalidation at most <c>Auth:RevalidationInterval</c> ago),
/// so the UI agrees with what the authorization checks see; display name, groups and the configuration source come from
/// the database (as recorded at the last login).
/// </remarks>
public sealed record GetCurrentUserQuery : IQuery<CurrentUserDto>, IRequireAuthenticated;
