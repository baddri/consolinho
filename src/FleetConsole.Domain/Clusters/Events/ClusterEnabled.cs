using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Clusters.Events;

/// <summary>An admin enabled a disabled cluster (CLU-5): it appears in the switcher again. Audited as <c>cluster.enabled</c>.</summary>
/// <param name="ClusterId">The cluster's id.</param>
/// <param name="Name">The cluster name.</param>
public sealed record ClusterEnabled(ClusterId ClusterId, string Name) : IDomainEvent;
