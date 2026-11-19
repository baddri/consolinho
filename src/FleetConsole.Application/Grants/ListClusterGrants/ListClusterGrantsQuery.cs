using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Grants.ListClusterGrants;

/// <summary>
/// Lists the grants on one cluster (cluster detail, "Access" tab), including grants of deactivated users and expired
/// credentials (GRANT-5). <c>GET /api/admin/clusters/{name}/grants</c>; sorted by username.
/// </summary>
/// <param name="ClusterName">The cluster from the route; unknown → <c>Clusters.NotFound</c>.</param>
public sealed record ListClusterGrantsQuery(string ClusterName) : IQuery<IReadOnlyList<GrantDto>>, IAdminRequest;
