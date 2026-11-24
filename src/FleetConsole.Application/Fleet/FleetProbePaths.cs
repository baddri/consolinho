using FleetConsole.Domain.Clusters;

namespace FleetConsole.Application.Fleet;

/// <summary>
/// The upstream requests the fleet overview makes per cluster (contract §3) — the one place their paths live, so the
/// proxy policy check in <c>ClusterHealthProbe</c> and the Infrastructure <c>ClusterHealthReader</c> that sends them can
/// never disagree.
/// </summary>
public static class FleetProbePaths
{
    /// <summary>OpenShift's ClusterVersion singleton (plain JSON).</summary>
    public const string ClusterVersion = "/apis/config.openshift.io/v1/clusterversions/version";

    /// <summary>OpenShift's ClusterOperator list (requested as a server-side Table).</summary>
    public const string ClusterOperators = "/apis/config.openshift.io/v1/clusteroperators";

    /// <summary>The Node list (requested as a server-side Table) — probed on every distribution.</summary>
    public const string Nodes = "/api/v1/nodes";

    /// <summary>The API server's version endpoint; probed on plain Kubernetes clusters only.</summary>
    public const string KubernetesVersion = "/version";

    /// <summary>
    /// Query of the Table requests: rows without the embedded objects (Node objects carry image lists, tens of KB each).
    /// </summary>
    public const string TableQuery = "?includeObject=None";

    private static readonly FleetProbeRequest[] OpenShiftRequests =
    [
        new(ClusterVersion, string.Empty),
        new(ClusterOperators, TableQuery),
        new(Nodes, TableQuery),
    ];

    private static readonly FleetProbeRequest[] KubernetesRequests =
    [
        new(KubernetesVersion, string.Empty),
        new(Nodes, TableQuery),
    ];

    /// <summary>The <c>GET</c> requests probed on a cluster of <paramref name="distribution"/>.</summary>
    /// <param name="distribution">The cluster's declared distribution.</param>
    /// <returns>OpenShift: ClusterVersion, ClusterOperators, Nodes; Kubernetes: version, Nodes.</returns>
    /// <exception cref="ArgumentOutOfRangeException">An undefined distribution value.</exception>
    public static IReadOnlyList<FleetProbeRequest> For(ClusterDistribution distribution) => distribution switch
    {
        ClusterDistribution.OpenShift => OpenShiftRequests,
        ClusterDistribution.Kubernetes => KubernetesRequests,
        _ => throw new ArgumentOutOfRangeException(nameof(distribution), distribution, "Unknown cluster distribution."),
    };
}

/// <summary>One fleet probe request: a raw API path and its query string, as the proxy would see them.</summary>
/// <param name="Path">The raw path (one of the <see cref="FleetProbePaths"/> constants).</param>
/// <param name="QueryString">Empty or starting with <c>?</c> (e.g. <see cref="FleetProbePaths.TableQuery"/>).</param>
public sealed record FleetProbeRequest(string Path, string QueryString);
