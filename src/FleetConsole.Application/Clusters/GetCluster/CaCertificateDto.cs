namespace FleetConsole.Application.Clusters.GetCluster;

// Published in the OpenAPI document as "CaCertificate"; the XML docs are written for API consumers.

/// <summary>One certificate of a cluster's CA bundle.</summary>
/// <param name="Subject">The subject distinguished name.</param>
/// <param name="Issuer">The issuer distinguished name.</param>
/// <param name="NotBefore">Start of validity (UTC).</param>
/// <param name="NotAfter">End of validity (UTC).</param>
/// <param name="ExpiryStatus">Validity now: expired, expiring within 30 days, or ok.</param>
/// <param name="Sha256Fingerprint">SHA-256 fingerprint as uppercase, colon-separated hex (as printed by openssl x509 -fingerprint -sha256).</param>
public sealed record CaCertificateDto(
    string Subject,
    string Issuer,
    DateTimeOffset NotBefore,
    DateTimeOffset NotAfter,
    CertificateExpiryStatus ExpiryStatus,
    string Sha256Fingerprint);
