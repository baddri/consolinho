using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Clusters.ListClusters;

/// <summary>
/// Lists every registered cluster for the administration list (CLU-7, contract §8.2 <c>GET /api/admin/clusters</c>),
/// sorted by name, with credential/grant counts, the worst credential expiry status and the newest connection test.
/// Enabled and disabled clusters alike; the list is bounded (tens of clusters), so it is a plain array.
/// </summary>
public sealed record ListClustersQuery : IQuery<IReadOnlyList<ClusterListItemDto>>, IAdminRequest;
