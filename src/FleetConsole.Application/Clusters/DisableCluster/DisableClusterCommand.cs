using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Clusters.DisableCluster;

/// <summary>
/// Hides a cluster from the switcher and stops access through it while keeping its credentials and grants (CLU-5, contract §8.2 <c>POST /api/admin/clusters/{name}/disable</c>). A cluster that is already disabled is left unchanged (no audit entry) and the call still succeeds. The
/// endpoint answers with <c>GetClusterQuery</c>. Audited as <c>cluster.disabled</c>.
/// </summary>
/// <param name="Name">The cluster name from the route.</param>
/// <param name="Version">The cluster's <c>version</c> the client last saw.</param>
public sealed record DisableClusterCommand(string Name, uint Version) : ICommand, IAdminRequest, IMutatingCommand;
