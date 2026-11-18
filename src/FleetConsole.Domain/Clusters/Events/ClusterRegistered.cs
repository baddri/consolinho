using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Clusters.Events;

/// <summary>An admin registered a cluster (CLU-1). Audited as <c>cluster.registered</c>.</summary>
/// <param name="ClusterId">The new cluster's id.</param>
/// <param name="Name">The cluster name (audit target and cluster name).</param>
/// <param name="Environment">The chosen environment.</param>
/// <param name="ApiUrl">The canonical API URL (<see cref="ApiServerEndpoint.ToString"/>).</param>
/// <param name="TlsMode">How TLS is verified; the CA content itself is never audited.</param>
/// <param name="IsEnabled">Whether the cluster was registered enabled.</param>
public sealed record ClusterRegistered(
    ClusterId ClusterId,
    string Name,
    ClusterEnvironment Environment,
    string ApiUrl,
    ClusterTlsMode TlsMode,
    bool IsEnabled) : IDomainEvent;
