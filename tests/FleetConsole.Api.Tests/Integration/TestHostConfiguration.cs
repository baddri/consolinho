using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using FleetConsole.Api.Tests.DevOAuth;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// Configuration every Api test host needs since the Api requires <c>Auth:OpenShift:*</c> and
/// <c>Console:PublicOrigin</c> at startup (T-0014/T-0015) and, outside Development, a Data Protection key-encryption
/// certificate (T-0099).
/// </summary>
internal static class TestHostConfiguration
{
    /// <summary>The public origin of test hosts: the same host as <c>TestServer</c>'s base address.</summary>
    public const string PublicOrigin = "http://localhost";

    /// <summary>
    /// Login against the in-process emulator (<see cref="TestOAuthServer"/>, base address <c>http://localhost</c>);
    /// allowed in Development only (http).
    /// </summary>
    public static Dictionary<string, string?> Emulator() => new()
    {
        ["Console:PublicOrigin"] = PublicOrigin,
        ["Auth:OpenShift:HostApiServerUrl"] = "http://localhost",
        ["Auth:OpenShift:ClientId"] = DevOAuthFlow.ClientId,
        ["Auth:OpenShift:ClientSecret"] = DevOAuthFlow.ClientSecret,
    };

    /// <summary>The password of every test key-encryption PFX (fake; tests assert it never appears in messages or logs).</summary>
    public const string CertificatePassword = "fake-test-pfx-password";

    // One certificate per test run, shared by every Production host (generating RSA keys is slow).
    private static readonly Lazy<(string PfxPath, string PasswordPath)> DefaultCertificate = new(() =>
        WriteKeyEncryptionCertificate(Directory.CreateTempSubdirectory("fleetconsole-test-dp-").FullName, "keys", CertificatePassword));

    /// <summary>
    /// A login configuration that passes validation in every environment (https everywhere) and never makes an outbound
    /// call: the static endpoints skip discovery, and <c>.invalid</c> hosts never resolve. For hosts whose tests don't
    /// log in, notably the Production-environment ones. Includes the test key-encryption certificate required outside
    /// Development.
    /// </summary>
    public static Dictionary<string, string?> Offline() => new()
    {
        ["Console:PublicOrigin"] = "https://console.invalid",
        ["Auth:OpenShift:HostApiServerUrl"] = "https://host-api.invalid:6443",
        ["Auth:OpenShift:AuthorizationEndpoint"] = "https://oauth.invalid/oauth/authorize",
        ["Auth:OpenShift:TokenEndpoint"] = "https://oauth.invalid/oauth/token",
        ["Auth:OpenShift:ClientId"] = DevOAuthFlow.ClientId,
        ["Auth:OpenShift:ClientSecret"] = DevOAuthFlow.ClientSecret,
        ["DataProtection:KeyEncryptionCertificatePath"] = DefaultCertificate.Value.PfxPath,
        ["DataProtection:KeyEncryptionCertificatePasswordPath"] = DefaultCertificate.Value.PasswordPath,
    };

    /// <summary>
    /// Writes a self-signed RSA key-encryption certificate as <c>{name}.pfx</c> with its password file
    /// (<c>{name}.password</c>, ending with a newline like a mounted Secret) into <paramref name="directory"/>.
    /// </summary>
    /// <param name="directory">An existing directory.</param>
    /// <param name="name">File name stem; also part of the subject, so certificates are distinguishable.</param>
    /// <param name="password">The PFX password.</param>
    /// <returns>The two paths.</returns>
    public static (string PfxPath, string PasswordPath) WriteKeyEncryptionCertificate(string directory, string name, string password)
    {
        // Key transport in EncryptedXml needs an RSA certificate.
        using var rsa = RSA.Create(2048);
        using var certificate = new CertificateRequest($"CN=FleetConsole key encryption {name} (test)", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)
            .CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddYears(1));
        var pfxPath = Path.Combine(directory, name + ".pfx");
        var passwordPath = Path.Combine(directory, name + ".password");
        File.WriteAllBytes(pfxPath, certificate.Export(X509ContentType.Pkcs12, password));
        File.WriteAllText(passwordPath, password + "\n");
        return (pfxPath, passwordPath);
    }
}
