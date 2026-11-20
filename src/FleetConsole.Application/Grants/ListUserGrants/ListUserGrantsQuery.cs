using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Grants.ListUserGrants;

/// <summary>
/// Lists the grants of one user (user detail, "Cluster access" tab), including grants of disabled clusters and expired
/// credentials (GRANT-5). <c>GET /api/admin/users/{username}/grants</c>; sorted by cluster name.
/// </summary>
/// <param name="Username">The user from the route; unknown → <c>Users.NotFound</c>.</param>
public sealed record ListUserGrantsQuery(string Username) : IQuery<IReadOnlyList<GrantDto>>, IAdminRequest;
