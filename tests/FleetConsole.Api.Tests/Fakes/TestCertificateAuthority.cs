using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace FleetConsole.Api.Tests.Fakes;

/// <summary>
/// An in-memory certificate authority for tests that need real TLS: a self-signed CA plus server certificates it
/// issues (valid, expired, or for the wrong host). Nothing touches the machine's trust store, so a client trusts these
/// certificates only when given <see cref="CertificatePem"/> as its CA bundle.
/// </summary>
/// <remarks>ECDSA P-256 keys: fast to generate and supported by Kestrel/OpenSSL.</remarks>
public sealed class TestCertificateAuthority : IDisposable
{
    private readonly X509Certificate2 _certificate;

    /// <summary>Creates a CA valid from 30 days ago for ten years (early enough to issue back-dated, expired server certificates).</summary>
    /// <param name="commonName">The CA's subject CN (visible in failures, handy when debugging).</param>
    public TestCertificateAuthority(string commonName = "FleetConsole Test CA")
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var request = new CertificateRequest($"CN={commonName}", key, HashAlgorithmName.SHA256);
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(certificateAuthority: true, hasPathLengthConstraint: false, pathLengthConstraint: 0, critical: true));
        request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.KeyCertSign | X509KeyUsageFlags.CrlSign, critical: true));
        request.CertificateExtensions.Add(new X509SubjectKeyIdentifierExtension(request.PublicKey, critical: false));

        var now = DateTimeOffset.UtcNow;
        _certificate = request.CreateSelfSigned(now.AddDays(-30), now.AddYears(10));
        CertificatePem = _certificate.ExportCertificatePem();
    }

    /// <summary>The CA certificate in PEM form — what an admin pastes as a cluster's CA bundle.</summary>
    public string CertificatePem { get; }

    /// <summary>
    /// Issues a TLS server certificate (with private key) signed by this CA.
    /// </summary>
    /// <param name="dnsNames">DNS SANs. Default: <c>localhost</c>.</param>
    /// <param name="ipAddresses">IP SANs. Default: <c>127.0.0.1</c>.</param>
    /// <param name="notBefore">Start of validity. Default: one hour ago.</param>
    /// <param name="notAfter">End of validity. Default: one year from now. Pass a past date for an expired cert.</param>
    /// <returns>The server certificate; the caller disposes it.</returns>
    public X509Certificate2 IssueServerCertificate(
        IEnumerable<string>? dnsNames = null, IEnumerable<IPAddress>? ipAddresses = null,
        DateTimeOffset? notBefore = null, DateTimeOffset? notAfter = null)
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var request = new CertificateRequest("CN=fake-kube-apiserver", key, HashAlgorithmName.SHA256);

        var san = new SubjectAlternativeNameBuilder();
        foreach (var dnsName in dnsNames ?? ["localhost"])
        {
            san.AddDnsName(dnsName);
        }

        foreach (var ipAddress in ipAddresses ?? [IPAddress.Loopback])
        {
            san.AddIpAddress(ipAddress);
        }

        request.CertificateExtensions.Add(san.Build());
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(certificateAuthority: false, hasPathLengthConstraint: false, pathLengthConstraint: 0, critical: true));
        request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature, critical: true));
        request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension([new Oid("1.3.6.1.5.5.7.3.1")], critical: false)); // serverAuth
        request.CertificateExtensions.Add(X509AuthorityKeyIdentifierExtension.CreateFromCertificate(_certificate, includeKeyIdentifier: true, includeIssuerAndSerial: false));

        var now = DateTimeOffset.UtcNow;
        var serial = RandomNumberGenerator.GetBytes(16);
        serial[0] &= 0x7F; // keep the serial number positive
        using var publicOnly = request.Create(_certificate, notBefore ?? now.AddHours(-1), notAfter ?? now.AddYears(1), serial);
        using var withKey = publicOnly.CopyWithPrivateKey(key);

        // Round-trip through PKCS#12 so the key is a persisted, exportable one that every TLS backend accepts.
        return X509CertificateLoader.LoadPkcs12(withKey.Export(X509ContentType.Pkcs12), password: null);
    }

    /// <inheritdoc />
    public void Dispose() => _certificate.Dispose();
}
