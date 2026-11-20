using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Clusters.Events;

/// <summary>
/// An admin deleted a disabled cluster (CLU-6); its credentials and grants are removed with it (database cascade, so no
/// separate events). Audited as <c>cluster.deleted</c> with the counts.
/// </summary>
/// <param name="ClusterId">The cluster's id.</param>
/// <param name="Name">The cluster name (kept in the audit entry after deletion).</param>
/// <param name="CredentialCount">Number of credentials removed with the cluster.</param>
/// <param name="GrantCount">Number of grants removed with the cluster.</param>
public sealed record ClusterDeleted(ClusterId ClusterId, string Name, int CredentialCount, int GrantCount) : IDomainEvent;
