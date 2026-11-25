using FleetConsole.Application.Clusters.ListAccessibleClusters;

namespace FleetConsole.Application.Fleet;

/// <summary>
/// The cached part of a fleet status line: one (cluster, credential)'s probe facts (ADR-0041 §3). Identity and access
/// mode are added per request by <see cref="ToStatus"/>, so users sharing a credential share one entry without sharing
/// anything personal.
/// </summary>
/// <remarks>
/// Travels through Redis, so it holds System.Text.Json-serializable primitives only — never a token, an access mode, a
/// user, a URL or upstream text (ADR-0040 §5, FBE-6).
/// </remarks>
/// <param name="CheckedAt">When the probe ran.</param>
/// <param name="Failure">The cluster-level failure, or null when the cluster could be read.</param>
/// <param name="KubernetesVersion">The Kubernetes version section, or null when not probed or failed.</param>
/// <param name="ClusterVersion">The ClusterVersion section, or null when not probed or failed.</param>
/// <param name="ClusterOperators">The ClusterOperators section, or null when not probed or failed.</param>
/// <param name="Nodes">The Nodes section, or null when failed.</param>
internal sealed record ClusterHealthFacts(
    DateTimeOffset CheckedAt,
    FleetClusterFailure? Failure,
    FleetKubernetesVersionDto? KubernetesVersion,
    FleetClusterVersionDto? ClusterVersion,
    FleetClusterOperatorsDto? ClusterOperators,
    FleetNodesDto? Nodes)
{
    /// <summary>Facts of a cluster that could not be read: only the failure, every section null.</summary>
    /// <param name="checkedAt">When the probe ran (or was refused).</param>
    /// <param name="failure">The cluster-level failure.</param>
    /// <returns>The facts.</returns>
    public static ClusterHealthFacts Failed(DateTimeOffset checkedAt, FleetClusterFailure failure) =>
        new(checkedAt, failure, null, null, null, null);

    /// <summary>The fleet status line of these facts for one user's view of the cluster.</summary>
    /// <param name="cluster">The cluster as the user sees it (name, environment, effective access mode, …).</param>
    /// <returns>The line.</returns>
    public FleetClusterStatusDto ToStatus(AccessibleClusterDto cluster)
    {
        ArgumentNullException.ThrowIfNull(cluster);
        return new FleetClusterStatusDto(cluster, CheckedAt, Failure, KubernetesVersion, ClusterVersion, ClusterOperators, Nodes);
    }
}
