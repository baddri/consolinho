using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Grants.ListClusterGrants;

/// <summary>
/// Lists the user and group grants on one cluster (cluster detail, "Access" tab, UIG-4), including grants of deactivated
/// users and expired credentials (GRANT-5). <c>GET /api/admin/clusters/{name}/grants</c>; user grants first, then group
/// grants, each sorted by subject name (ordinal). The group grants' priorities are the cluster's used priorities (UIG-3).
/// </summary>
/// <param name="ClusterName">The cluster from the route; unknown → <c>Clusters.NotFound</c>.</param>
public sealed record ListClusterGrantsQuery(string ClusterName) : IQuery<IReadOnlyList<GrantDto>>, IAdminRequest;
