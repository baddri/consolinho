using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Clusters.GetCluster;

/// <summary>
/// Reads one cluster with all settings, its CA certificate summaries and the credential/grant counts (CLU-2, CLU-8,
/// contract §8.2 <c>GET /api/admin/clusters/{name}</c>). Also the response of every cluster command endpoint, which
/// dispatches it after the command committed so the returned <c>version</c> is fresh (ADR-0013 §5).
/// </summary>
/// <param name="Name">The cluster name from the route; unknown or malformed names are <c>Clusters.NotFound</c>.</param>
public sealed record GetClusterQuery(string Name) : IQuery<ClusterDetailDto>, IAdminRequest;
