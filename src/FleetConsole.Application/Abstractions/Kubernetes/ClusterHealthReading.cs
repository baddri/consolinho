namespace FleetConsole.Application.Abstractions.Kubernetes;

/// <summary>
/// What <see cref="IClusterHealthReader.ReadAsync"/> found on one cluster: one <see cref="ProbeResponse{T}"/> per probe
/// of the distribution's set, already reduced to the facts the fleet overview shows (ADR-0041 §2, contract §3).
/// </summary>
/// <remarks>The Application's <c>ClusterHealthFactsMapper</c> turns it into cacheable facts and decides the
/// cluster-level failure; nothing here carries upstream text beyond the adapter's own failure message.</remarks>
/// <param name="KubernetesVersion"><c>GET /version</c>; <see langword="null"/> when not probed (OpenShift clusters).</param>
/// <param name="ClusterVersion">The <c>version</c> ClusterVersion; <see langword="null"/> when not probed (Kubernetes clusters).</param>
/// <param name="ClusterOperators">ClusterOperator condition counts; <see langword="null"/> when not probed (Kubernetes clusters).</param>
/// <param name="Nodes">Node counts; probed on every distribution.</param>
public sealed record ClusterHealthReading(
    ProbeResponse<KubernetesVersionFacts>? KubernetesVersion,
    ProbeResponse<ClusterVersionFacts>? ClusterVersion,
    ProbeResponse<ClusterOperatorCounts>? ClusterOperators,
    ProbeResponse<NodeCounts> Nodes);

/// <summary>The Kubernetes version a plain Kubernetes cluster reports on <c>GET /version</c>.</summary>
/// <param name="GitVersion">The <c>gitVersion</c> field, e.g. <c>v1.31.4</c>.</param>
public sealed record KubernetesVersionFacts(string GitVersion);

/// <summary>
/// The OpenShift ClusterVersion <c>version</c>, reduced to the update state the fleet overview shows (contract §2:
/// current version = newest Completed history entry, else the desired version).
/// </summary>
/// <param name="CurrentVersion">The version the cluster runs, if known.</param>
/// <param name="DesiredVersion"><c>status.desired.version</c>: the version an update is heading to.</param>
/// <param name="Available">Condition <c>Available == True</c>; <see langword="null"/> when the condition is absent.</param>
/// <param name="Progressing">Condition <c>Progressing == True</c>; <see langword="null"/> when absent.</param>
/// <param name="Failing">Condition <c>Failing == True</c>; <see langword="null"/> when absent.</param>
/// <param name="AvailableUpdates">Length of <c>status.availableUpdates</c> (0 when null or absent).</param>
public sealed record ClusterVersionFacts(
    string? CurrentVersion,
    string? DesiredVersion,
    bool? Available,
    bool? Progressing,
    bool? Failing,
    int AvailableUpdates);

/// <summary>ClusterOperator condition counts, read from the server-side Table's columns (contract §3).</summary>
/// <param name="Total">Number of ClusterOperators.</param>
/// <param name="Degraded">Operators with <c>Degraded == True</c>.</param>
/// <param name="Unavailable">Operators whose <c>Available</c> is not <c>True</c> (False, Unknown or missing).</param>
/// <param name="Progressing">Operators with <c>Progressing == True</c>.</param>
public sealed record ClusterOperatorCounts(int Total, int Degraded, int Unavailable, int Progressing);

/// <summary>Node counts, read from the server-side Table's <c>Status</c> column (contract §3).</summary>
/// <param name="Total">Number of nodes.</param>
/// <param name="Ready">Nodes whose Ready condition is True.</param>
/// <param name="Unschedulable">Nodes with <c>spec.unschedulable</c> (<c>SchedulingDisabled</c> in the Table).</param>
public sealed record NodeCounts(int Total, int Ready, int Unschedulable);
