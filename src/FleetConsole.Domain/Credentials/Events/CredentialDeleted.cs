using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Credentials.Events;

/// <summary>
/// An admin deleted an unused credential (CRED-6). Audited as <c>credential.deleted</c>. Not raised when a credential is
/// removed by the cascade of a cluster deletion (that is covered by <c>ClusterDeleted</c>).
/// </summary>
/// <param name="CredentialId">The credential's id.</param>
/// <param name="ClusterId">The cluster it belonged to.</param>
/// <param name="ClusterName">The cluster's name.</param>
/// <param name="Name">The credential's name (kept in the audit entry after deletion).</param>
/// <param name="Fingerprint">Fingerprint of the deleted token.</param>
public sealed record CredentialDeleted(
    CredentialId CredentialId,
    ClusterId ClusterId,
    string ClusterName,
    string Name,
    string Fingerprint) : IDomainEvent;
