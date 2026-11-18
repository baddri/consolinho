using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Domain.Tests;

/// <summary>Builders for valid aggregates and value objects shared by the cluster, credential and grant tests.</summary>
internal static class DomainTestData
{
    public static readonly DateTimeOffset Now = new(2026, 11, 18, 9, 30, 0, TimeSpan.Zero);

    public const string ApiUrl = "https://api.prod-eu-1.example.com:6443";

    public static ClusterName NameOf(string value = "prod-eu-1") => ClusterName.Create(value).Value;

    public static ApiServerEndpoint Endpoint(string url = ApiUrl, string? caBundlePem = null, bool skipTlsVerify = false) =>
        ApiServerEndpoint.Create(url, caBundlePem, skipTlsVerify).Value;

    public static Cluster NewCluster(string name = "prod-eu-1", bool isEnabled = true)
    {
        var cluster = Cluster.Register(
            NameOf(name), null, Endpoint(), ClusterEnvironment.Production, null, null, isEnabled, "admin", Now);
        cluster.ClearDomainEvents();
        return cluster;
    }

    public static Credential NewCredential(Cluster cluster, string name = "fleet-view", string fingerprint = "0badc0de")
    {
        var credential = Credential.Add(
            cluster, CredentialName.Create(name).Value, null, Token(1), Fingerprint(fingerprint),
            JwtMetadata(), "admin", Now);
        credential.ClearDomainEvents();
        return credential;
    }

    public static User NewUser(string username = "alice")
    {
        var user = User.PreCreate(Username.Create(username).Value, UserRole.User, false, "admin", Now);
        user.ClearDomainEvents();
        return user;
    }

    public static EncryptedToken Token(byte seed) => new([seed, 0x42, 0x13, 0x37]);

    public static TokenFingerprint Fingerprint(string value) => TokenFingerprint.Create(value).Value;

    public static TokenMetadata JwtMetadata() =>
        new(TokenType.Jwt, "system:serviceaccount:fleet:viewer", Now.AddDays(-1), Now.AddDays(90));

    /// <summary>A freshly generated self-signed CA certificate as PEM (no fixtures with real keys in the repo).</summary>
    public static string CertificatePem(string commonName = "test-ca", int validDays = 365)
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var request = new CertificateRequest($"CN={commonName}", key, HashAlgorithmName.SHA256);
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, false, 0, true));
        var notBefore = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        using var certificate = request.CreateSelfSigned(notBefore, notBefore.AddDays(validDays));
        return certificate.ExportCertificatePem();
    }

    /// <summary>A generated private key as PEM, to check that CA bundles refuse key material.</summary>
    public static string PrivateKeyPem()
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        return key.ExportPkcs8PrivateKeyPem();
    }
}
