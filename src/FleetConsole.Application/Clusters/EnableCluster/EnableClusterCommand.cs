using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Clusters.EnableCluster;

/// <summary>
/// Makes a disabled cluster available to granted users again (CLU-5, contract §8.2 <c>POST /api/admin/clusters/{name}/enable</c>). A cluster that is already enabled is left unchanged (no audit entry) and the call still succeeds. The
/// endpoint answers with <c>GetClusterQuery</c>. Audited as <c>cluster.enabled</c>.
/// </summary>
/// <param name="Name">The cluster name from the route.</param>
/// <param name="Version">The cluster's <c>version</c> the client last saw.</param>
public sealed record EnableClusterCommand(string Name, uint Version) : ICommand, IAdminRequest, IMutatingCommand;
