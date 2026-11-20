using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Domain.Clusters;

namespace FleetConsole.Application.Proxy;

/// <summary>
/// Where and how an authorized proxy request is forwarded: the answer of
/// <see cref="AuthorizeProxyRequest.AuthorizeProxyRequestQuery"/>. The Api's forwarder uses <see cref="Connection"/> to
/// pick the upstream (and its TLS settings) and <see cref="Token"/> as the <c>Authorization: Bearer</c> value.
/// </summary>
/// <param name="ClusterId">The target cluster's id (for audit and the per-cluster HTTP client).</param>
/// <param name="ClusterName">The target cluster's name, as used in error messages.</param>
/// <param name="Connection">API server URL and TLS settings of the cluster.</param>
/// <param name="Token">
/// The decrypted ServiceAccount token assigned to the user for this cluster. <see cref="SensitiveString"/> keeps it out
/// of logs and serialized output.
/// </param>
public sealed record ProxyTarget(ClusterId ClusterId, string ClusterName, ClusterConnection Connection, SensitiveString Token);
