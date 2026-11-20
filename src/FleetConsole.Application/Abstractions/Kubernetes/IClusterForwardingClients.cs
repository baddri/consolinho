using System.Diagnostics.CodeAnalysis;
using FleetConsole.Domain.Clusters;

namespace FleetConsole.Application.Abstractions.Kubernetes;

/// <summary>
/// Port for the proxy's long-lived, per-cluster HTTP invokers (ADR-0020 §1). Each managed cluster gets one invoker
/// that trusts only that cluster's TLS settings (PRX-7), shared by every user and request that targets it, so
/// connections (and HTTP/2 streams) are pooled per cluster instead of per request.
/// </summary>
/// <remarks>
/// Admin edits need no invalidation event: the caller passes the connection settings it just loaded, and the pool
/// rebuilds the invoker when they differ from the ones it was built from (<see cref="ClusterConnection"/> value
/// equality). Implemented in Infrastructure (<c>ClusterForwardingClientPool</c>); never used for connection tests,
/// which need their own short-lived handler to classify TLS failures (<see cref="IClusterProbeClient"/>).
/// </remarks>
public interface IClusterForwardingClients
{
    /// <summary>
    /// Gets the invoker for <paramref name="clusterId"/> built from exactly <paramref name="connection"/>, building or
    /// rebuilding it when the stored connection differs. Never returns a disposed invoker; callers must not dispose it.
    /// </summary>
    /// <param name="clusterId">The target cluster; the pool key.</param>
    /// <param name="connection">The cluster's current API URL and TLS settings.</param>
    /// <param name="invoker">The invoker to forward with, or <see langword="null"/> when the method returns
    /// <see langword="false"/>.</param>
    /// <returns><see langword="false"/> when the stored CA bundle can't be parsed (logged as a Warning without the CA
    /// content); the proxy answers 502 <c>Proxy.UpstreamTls</c>.</returns>
    bool TryGetInvoker(ClusterId clusterId, ClusterConnection connection, [NotNullWhen(true)] out HttpMessageInvoker? invoker);
}
