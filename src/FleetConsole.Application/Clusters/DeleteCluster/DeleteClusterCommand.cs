using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Clusters.DeleteCluster;

/// <summary>
/// Deletes a disabled cluster together with its credentials and grants (CLU-6, contract §8.2
/// <c>DELETE /api/admin/clusters/{name}</c>). An enabled cluster is refused with 409 <c>Clusters.NotDisabled</c>, so a
/// deletion is always a deliberate two-step action. Audited as <c>cluster.deleted</c> with the removed counts.
/// </summary>
/// <param name="Name">The cluster name from the route.</param>
public sealed record DeleteClusterCommand(string Name) : ICommand, IAdminRequest, IMutatingCommand;
