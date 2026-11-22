using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Credentials.Events;

/// <summary>An admin added a ServiceAccount credential to a cluster (CRED-1). Audited as <c>credential.added</c>.</summary>
/// <param name="CredentialId">The new credential's id.</param>
/// <param name="ClusterId">The cluster it belongs to.</param>
/// <param name="ClusterName">The cluster's name.</param>
/// <param name="Name">The credential's name (audit target name).</param>
/// <param name="Fingerprint">The token fingerprint (never the token).</param>
/// <param name="TokenType">JWT or opaque.</param>
/// <param name="ServiceAccount">The <c>&lt;namespace&gt;/&lt;name&gt;</c> of the token's ServiceAccount, if known.</param>
/// <param name="InspectNamespaces">The namespaces saved on the credential (names only; audited, NST-7).</param>
public sealed record CredentialAdded(
    CredentialId CredentialId,
    ClusterId ClusterId,
    string ClusterName,
    string Name,
    string Fingerprint,
    TokenType TokenType,
    string? ServiceAccount,
    IReadOnlyList<string> InspectNamespaces) : IDomainEvent;
