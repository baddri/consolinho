namespace FleetConsole.Application.Abstractions.Kubernetes;

/// <summary>
/// One connection-test run against one cluster with one token (see <see cref="IClusterProbeClient.Open"/>). Calls may
/// run concurrently (the capability step issues several access reviews at once).
/// </summary>
/// <remarks>
/// <para>Every call returns a <see cref="ProbeResponse{T}"/>: network, TLS, HTTP-status and parsing failures are
/// categorized into <see cref="ProbeFailureKind"/>. A call that exceeds the adapter's per-request timeout fails with
/// <see cref="ProbeFailureKind.Timeout"/>.</para>
/// <para>Cancelling <em>the caller's</em> token throws <see cref="OperationCanceledException"/> as usual; a caller that
/// enforces an overall budget with its own linked token (the connection test's 15 s) maps that to a timeout itself.</para>
/// </remarks>
public interface IClusterProbeSession : IAsyncDisposable
{
    /// <summary><c>GET /version</c>: reachability, TLS and "is this a Kubernetes API server".</summary>
    /// <param name="cancellationToken">Caller cancellation.</param>
    /// <returns>The server's Kubernetes version, or why the call failed.</returns>
    Task<ProbeResponse<KubernetesVersionInfo>> GetVersionAsync(CancellationToken cancellationToken);

    /// <summary><c>POST /apis/authentication.k8s.io/v1/selfsubjectreviews</c>: who the token is. 404 on clusters older
    /// than Kubernetes 1.28 (the caller falls back to an access review).</summary>
    /// <param name="cancellationToken">Caller cancellation.</param>
    /// <returns>The authenticated identity, or why the call failed.</returns>
    Task<ProbeResponse<SelfSubjectReviewInfo>> GetSelfSubjectReviewAsync(CancellationToken cancellationToken);

    /// <summary><c>GET /apis/config.openshift.io/v1/clusterversions/version</c>: the OpenShift version. 403/404 are
    /// common (non-OpenShift cluster, or the token may not read it) and are not connection problems.</summary>
    /// <param name="cancellationToken">Caller cancellation.</param>
    /// <returns>The OpenShift version and whether an update is running, or why the call failed.</returns>
    Task<ProbeResponse<ClusterVersionInfo>> GetClusterVersionAsync(CancellationToken cancellationToken);

    /// <summary><c>POST /apis/authorization.k8s.io/v1/selfsubjectaccessreviews</c>: may the token do this?</summary>
    /// <param name="attributes">The request to ask about.</param>
    /// <param name="cancellationToken">Caller cancellation.</param>
    /// <returns>The authorizer's answer, or why the call failed.</returns>
    Task<ProbeResponse<AccessReviewResult>> ReviewAccessAsync(ResourceAttributes attributes, CancellationToken cancellationToken);

    /// <summary><c>POST /apis/authorization.k8s.io/v1/selfsubjectrulesreviews</c>: everything the token may do in a
    /// namespace.</summary>
    /// <param name="namespaceName">The namespace to enumerate rules for.</param>
    /// <param name="cancellationToken">Caller cancellation.</param>
    /// <returns>The allowed rules, or why the call failed.</returns>
    Task<ProbeResponse<RulesReviewResult>> ReviewRulesAsync(string namespaceName, CancellationToken cancellationToken);
}
