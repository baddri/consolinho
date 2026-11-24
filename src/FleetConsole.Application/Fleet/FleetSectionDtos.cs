namespace FleetConsole.Application.Fleet;

// Sections of the fleet status line (contract §2), published in the OpenAPI document; the XML docs are written for API
// consumers. They carry normalized facts only — the health status is derived in the frontend (ADR-0041 §4).

/// <summary>The Kubernetes version of a plain Kubernetes cluster (<c>GET /version</c>).</summary>
/// <param name="Outcome">How the probe went.</param>
/// <param name="GitVersion">The reported version, e.g. <c>v1.31.4</c>; null unless <paramref name="Outcome"/> is ok.</param>
public sealed record FleetKubernetesVersionDto(FleetProbeOutcome Outcome, string? GitVersion);

/// <summary>The OpenShift version and update state (ClusterVersion <c>version</c>).</summary>
/// <param name="Outcome">How the probe went; every other field is null unless it is ok.</param>
/// <param name="CurrentVersion">The newest Completed history entry's version, else the desired version.</param>
/// <param name="DesiredVersion">The version the cluster is heading to ("Updating to …").</param>
/// <param name="Available">Condition Available is True (null when the condition is absent).</param>
/// <param name="Progressing">Condition Progressing is True (an update is running).</param>
/// <param name="Failing">Condition Failing is True.</param>
/// <param name="AvailableUpdates">Number of available updates.</param>
public sealed record FleetClusterVersionDto(
    FleetProbeOutcome Outcome,
    string? CurrentVersion,
    string? DesiredVersion,
    bool? Available,
    bool? Progressing,
    bool? Failing,
    int? AvailableUpdates);

/// <summary>ClusterOperator counts (OpenShift only).</summary>
/// <param name="Outcome">How the probe went; the counts are null unless it is ok.</param>
/// <param name="Total">Number of ClusterOperators.</param>
/// <param name="Degraded">Operators with Degraded True.</param>
/// <param name="Unavailable">Operators whose Available is not True (False, Unknown or missing).</param>
/// <param name="Progressing">Operators with Progressing True.</param>
public sealed record FleetClusterOperatorsDto(
    FleetProbeOutcome Outcome,
    int? Total,
    int? Degraded,
    int? Unavailable,
    int? Progressing);

/// <summary>Node counts (every distribution).</summary>
/// <param name="Outcome">How the probe went; the counts are null unless it is ok.</param>
/// <param name="Total">Number of nodes.</param>
/// <param name="Ready">Nodes whose Ready condition is True.</param>
/// <param name="NotReady">Total minus ready (Ready False or Unknown).</param>
/// <param name="Unschedulable">Cordoned nodes (SchedulingDisabled).</param>
public sealed record FleetNodesDto(
    FleetProbeOutcome Outcome,
    int? Total,
    int? Ready,
    int? NotReady,
    int? Unschedulable);
