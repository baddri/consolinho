using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Credentials.Events;

/// <summary>
/// An admin replaced a credential's token in place (CRED-5); id and grants are unchanged. Audited as
/// <c>credential.rotated</c> with both fingerprints.
/// </summary>
/// <param name="CredentialId">The credential's id.</param>
/// <param name="ClusterId">The cluster it belongs to.</param>
/// <param name="ClusterName">The cluster's name.</param>
/// <param name="Name">The credential's name.</param>
/// <param name="OldFingerprint">Fingerprint of the replaced token.</param>
/// <param name="NewFingerprint">Fingerprint of the new token.</param>
public sealed record CredentialRotated(
    CredentialId CredentialId,
    ClusterId ClusterId,
    string ClusterName,
    string Name,
    string OldFingerprint,
    string NewFingerprint) : IDomainEvent;
