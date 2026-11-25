using FleetConsole.Domain.Clusters;

namespace FleetConsole.Application.Abstractions.Kubernetes;

/// <summary>
/// Reads one cluster's health facts for the fleet overview (ADR-0041 §2): the read-only probes of
/// <c>FleetProbePaths.For(distribution)</c>, sent through the cluster's forwarding-pool client (same TLS trust and pooled
/// connections as the proxy) with the user's winning grant token, reduced to counts in the adapter.
/// </summary>
/// <remarks>
/// <para>The probes of one call run concurrently. Every expected failure (network, TLS, HTTP status, an unparsable or
/// oversized answer, a Table without the needed column) is data: the probe's <see cref="ProbeResponse{T}"/> carries a
/// <see cref="ProbeFailureKind"/>, never upstream text the caller would have to scrub.</para>
/// <para>Cancelling the token passed to <see cref="ReadAsync"/> throws
/// <see cref="OperationCanceledException"/>. The caller enforces the per-cluster budget (<c>Fleet:ClusterTimeout</c>)
/// with a linked token and maps that cancellation to a timeout itself, as with <see cref="IClusterProbeSession"/>.</para>
/// <para>Implemented in Infrastructure (<c>ClusterHealthReader</c>); used only by the Application's
/// <c>ClusterHealthProbe</c>, which owns caching, policies and the budget.</para>
/// </remarks>
public interface IClusterHealthReader
{
    /// <summary>
    /// Runs the distribution's probes (OpenShift: ClusterVersion, ClusterOperators, Nodes; Kubernetes: <c>/version</c>,
    /// Nodes) concurrently against one cluster and returns their reduced results.
    /// </summary>
    /// <param name="clusterId">The cluster, selecting its forwarding-pool client.</param>
    /// <param name="connection">How to reach the API server (URL, CA bundle, TLS settings).</param>
    /// <param name="distribution">The declared distribution; picks the probe set.</param>
    /// <param name="token">The user's winning grant token, plaintext only for the duration of the call.</param>
    /// <param name="cancellationToken">The caller's budget; cancelling it throws <see cref="OperationCanceledException"/>.</param>
    /// <returns>One result per probe; probes the distribution doesn't use are <see langword="null"/>.</returns>
    Task<ClusterHealthReading> ReadAsync(
        ClusterId clusterId,
        ClusterConnection connection,
        ClusterDistribution distribution,
        SensitiveString token,
        CancellationToken cancellationToken);
}
