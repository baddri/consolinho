namespace FleetConsole.Domain.Clusters;

/// <summary>
/// Display summary of one certificate of a <see cref="CaBundle"/>, extracted when the bundle is parsed so the detail page
/// can show subject, issuer and validity (CLU-2) without re-parsing PEM. The expiry status shown in the UI is computed
/// from <see cref="NotAfter"/> at read time.
/// </summary>
/// <param name="Subject">The subject distinguished name, e.g. <c>CN=kube-apiserver-lb-signer, OU=openshift</c>.</param>
/// <param name="Issuer">The issuer distinguished name.</param>
/// <param name="NotBefore">Start of validity (UTC).</param>
/// <param name="NotAfter">End of validity (UTC).</param>
/// <param name="Sha256Fingerprint">SHA-256 of the DER encoding as uppercase, colon-separated hex
/// (<c>AB:CD:…</c>), the format <c>openssl x509 -fingerprint -sha256</c> prints.</param>
public sealed record CaCertificateInfo(
    string Subject,
    string Issuer,
    DateTimeOffset NotBefore,
    DateTimeOffset NotAfter,
    string Sha256Fingerprint);
