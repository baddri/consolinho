using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Clusters.ListAccessibleClusters;

/// <summary>
/// The clusters the signed-in user may switch to (SW-1): enabled clusters on which the (active) user has a grant, sorted
/// by environment (production, staging, development), then name. <c>GET /api/clusters</c>. Admins get only their own
/// grants too (GRANT-6); without grants the list is empty (SW-4).
/// </summary>
public sealed record ListAccessibleClustersQuery : IQuery<IReadOnlyList<AccessibleClusterDto>>, IRequireAuthenticated;
