using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Xml.Linq;
using FleetConsole.Infrastructure;
using FleetConsole.Infrastructure.Crypto;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.XmlEncryption;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Tests.Persistence;

/// <summary>
/// How <c>AddInfrastructure</c> configures Data Protection (ADR-0004, contract §12), checked on the built service
/// provider without a database: key ring repository, optional key encryption with a PFX certificate (+ password file),
/// and the startup warning when key encryption is missing outside Development.
/// </summary>
public sealed class DataProtectionSetupTests : IDisposable
{
    private readonly string _directory = Directory.CreateTempSubdirectory("fleetconsole-dp-").FullName;

    [Fact]
    public void KeyRing_IsPersistedInTheConsoleDatabase()
    {
        using var host = Build(Environments.Development);

        var options = host.Services.GetRequiredService<IOptions<KeyManagementOptions>>().Value;

        options.XmlRepository.ShouldBeOfType<EntityFrameworkCoreXmlRepository<ConsoleDbContext>>();
        options.XmlEncryptor.ShouldBeNull();
    }

    [Fact]
    public void WithCertificateAndPasswordFile_KeysAreEncryptedAndDecryptableWithIt()
    {
        var (pfxPath, passwordPath) = WriteCertificate(password: "fake-test-password");
        using var host = Build(Environments.Production, new()
        {
            [DataProtectionSetup.CertificatePathKey] = pfxPath,
            [DataProtectionSetup.CertificatePasswordPathKey] = passwordPath,
        });
        var options = host.Services.GetRequiredService<IOptions<KeyManagementOptions>>().Value;
        var secretKey = new XElement("key", "fake-master-key-material");

        options.XmlEncryptor.ShouldBeOfType<CertificateXmlEncryptor>();
        var encrypted = options.XmlEncryptor!.Encrypt(secretKey);
        encrypted.EncryptedElement.ToString().ShouldNotContain("fake-master-key-material");

        // The certificate is also registered for decryption: no machine certificate store is needed to read keys back.
        var decrypted = new EncryptedXmlDecryptor(host.Services).Decrypt(encrypted.EncryptedElement);
        decrypted.Value.ShouldBe("fake-master-key-material");
        HostedServiceTypes(host).ShouldNotContain(typeof(UnprotectedKeyRingWarning));
    }

    [Fact]
    public void CertificateWithoutPrivateKey_FailsAtStartup()
    {
        using var rsa = RSA.Create(2048);
        using var certificate = new CertificateRequest("CN=public-only", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)
            .CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(1));
        var path = Path.Combine(_directory, "public-only.pfx");
        File.WriteAllBytes(path, certificate.Export(X509ContentType.Cert));

        Should.Throw<Exception>(() => Build(Environments.Production, new() { [DataProtectionSetup.CertificatePathKey] = path }).Dispose());
    }

    [Theory]
    [InlineData("Production", true)]
    [InlineData("Staging", true)]
    [InlineData("Development", false)]
    public void WithoutCertificate_WarnsOutsideDevelopment(string environment, bool warns)
    {
        using var host = Build(environment);

        HostedServiceTypes(host).Contains(typeof(UnprotectedKeyRingWarning)).ShouldBe(warns);
    }

    public void Dispose() => Directory.Delete(_directory, recursive: true);

    private static IHost Build(string environment, Dictionary<string, string?>? settings = null)
    {
        var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
        {
            EnvironmentName = environment,
            DisableDefaults = true,
        });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            [$"ConnectionStrings:{ConsoleDbContext.ConnectionName}"] = "Host=unused.invalid;Database=unused",
        });
        builder.Configuration.AddInMemoryCollection(settings ?? []);
        builder.AddInfrastructure();
        return builder.Build();
    }

    private static Type[] HostedServiceTypes(IHost host) =>
        host.Services.GetServices<IHostedService>().Select(service => service.GetType()).ToArray();

    private (string PfxPath, string PasswordPath) WriteCertificate(string password)
    {
        // Key transport in EncryptedXml needs an RSA certificate.
        using var rsa = RSA.Create(2048);
        using var certificate = new CertificateRequest("CN=FleetConsole key encryption (test)", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)
            .CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddYears(1));
        var pfxPath = Path.Combine(_directory, "keys.pfx");
        var passwordPath = Path.Combine(_directory, "password");
        File.WriteAllBytes(pfxPath, certificate.Export(X509ContentType.Pkcs12, password));
        File.WriteAllText(passwordPath, password + "\n");   // mounted secrets often end with a newline
        return (pfxPath, passwordPath);
    }
}
