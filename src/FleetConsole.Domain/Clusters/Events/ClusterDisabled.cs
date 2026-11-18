using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Clusters.Events;

/// <summary>
/// An admin disabled a cluster (CLU-5): it disappears from the switcher; grants and credentials are kept. Audited as
/// <c>cluster.disabled</c>.
/// </summary>
/// <param name="ClusterId">The cluster's id.</param>
/// <param name="Name">The cluster name.</param>
public sealed record ClusterDisabled(ClusterId ClusterId, string Name) : IDomainEvent;
