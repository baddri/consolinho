using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Clusters.Events;

/// <summary>
/// An admin changed a cluster's editable settings (CLU-4). Audited as <c>cluster.updated</c> with the changed field
/// names only (never CA content). Only raised when at least one field changed.
/// </summary>
/// <param name="ClusterId">The cluster's id.</param>
/// <param name="Name">The cluster name.</param>
/// <param name="ChangedFields">The changed fields as camelCase API names, in request order:
/// <c>displayName</c>, <c>apiUrl</c>, <c>environment</c>, <c>webConsoleUrl</c>, <c>description</c>, <c>caBundle</c>,
/// <c>skipTlsVerify</c>.</param>
public sealed record ClusterUpdated(ClusterId ClusterId, string Name, IReadOnlyList<string> ChangedFields) : IDomainEvent;
