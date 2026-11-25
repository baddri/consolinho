using FleetConsole.Application.Clusters.ListAccessibleClusters;

namespace FleetConsole.Application.Fleet;

// One NDJSON line of GET /api/fleet/status (contract §2), published in the OpenAPI document as "FleetClusterStatus";
// the XML docs below are written for API consumers.

/// <summary>
/// The health facts of one cluster the user may access. Sections are null when not probed (Kubernetes clusters have no
/// clusterVersion/clusterOperators, OpenShift clusters no kubernetesVersion) and all of them are null when
/// <paramref name="Failure"/> is set.
/// </summary>
/// <param name="Cluster">The cluster, as <c>GET /api/clusters</c> lists it (with the user's effective access mode).</param>
/// <param name="CheckedAt">When the facts were probed; cached for <c>Fleet:CacheDuration</c>, so it is "Last checked".</param>
/// <param name="Failure">Why the cluster could not be read at all, or null when it could.</param>
/// <param name="KubernetesVersion">The Kubernetes version (Kubernetes clusters only).</param>
/// <param name="ClusterVersion">The OpenShift version and update state (OpenShift only).</param>
/// <param name="ClusterOperators">ClusterOperator counts (OpenShift only).</param>
/// <param name="Nodes">Node counts.</param>
public sealed record FleetClusterStatusDto(
    AccessibleClusterDto Cluster,
    DateTimeOffset CheckedAt,
    FleetClusterFailure? Failure,
    FleetKubernetesVersionDto? KubernetesVersion,
    FleetClusterVersionDto? ClusterVersion,
    FleetClusterOperatorsDto? ClusterOperators,
    FleetNodesDto? Nodes);
