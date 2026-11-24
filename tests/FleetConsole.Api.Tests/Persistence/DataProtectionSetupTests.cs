using System.Security.Cryptography.X509Certificates;
using System.Xml.Linq;
using FleetConsole.Api.Tests.Integration;
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
/// How <c>AddInfrastructure</c> configures Data Protection (ADR-0004, ADR-0028 §6), checked on the built service
/// provider without a database: key ring repository, mandatory key encryption outside Development with a PFX certificate
/// (+ password file), decryption-only previous certificate for rotations (OPS-2), and the start-time validation (CFG-2,
/// HOST-6) that runs exactly what <c>ValidateOnStart</c> runs when the host starts.
/// </summary>
public sealed class DataProtectionSetupTests : IDisposable
{
    private const string Password = TestHostConfiguration.CertificatePassword;

    private readonly string _directory = Directory.CreateTempSubdirectory("fleetconsole-dp-").FullName;

    [Fact]
    public void KeyRing_IsPersistedInTheConsoleDatabase_UnencryptedInDevelopmentWithoutCertificate()
    {
        using var host = Build(Environments.Development);

        Should.NotThrow(() => Validate(host));
        var options = host.Services.GetRequiredService<IOptions<KeyManagementOptions>>().Value;

        options.XmlRepository.ShouldBeOfType<EntityFrameworkCoreXmlRepository<ConsoleDbContext>>();
        options.XmlEncryptor.ShouldBeNull();
    }

    [Fact]
    public void WithCertificateAndPasswordFile_KeysAreEncryptedAndDecryptableWithIt()
    {
        using var host = Build(Environments.Production, Current("keys"));

        Should.NotThrow(() => Validate(host));
        var encrypted = Encrypt(host, "fake-master-key-material");

        encrypted.EncryptedElement.ToString().ShouldNotContain("fake-master-key-material");
        // The certificate is also registered for decryption: no machine certificate store is needed to read keys back.
        Decrypt(host, encrypted).Value.ShouldBe("fake-master-key-material");
    }

    [Fact]
    public void Registration_DoesNotReadTheCertificateFiles()
    {
        // ADR-0027 §2: the migrate init container builds the same host without the mounted certificate.
        Should.NotThrow(() => Build(Environments.Production, new()
        {
            [DataProtectionSetup.CertificatePathKey] = Path.Combine(_directory, "not-mounted.pfx"),
        }).Dispose());
    }

    [Theory]
    [InlineData("missing-path", DataProtectionSetup.CertificatePathKey)]
    [InlineData("missing-file", DataProtectionSetup.CertificatePathKey)]
    [InlineData("missing-password-file", DataProtectionSetup.CertificatePasswordPathKey)]
    [InlineData("wrong-password", DataProtectionSetup.CertificatePathKey)]
    [InlineData("not-a-pfx", DataProtectionSetup.CertificatePathKey)]
    [InlineData("no-private-key", DataProtectionSetup.CertificatePathKey)]
    [InlineData("previous-missing-file", DataProtectionSetup.PreviousCertificatePathKey)]
    [InlineData("previous-wrong-password", DataProtectionSetup.PreviousCertificatePathKey)]
    public void InvalidCertificateConfiguration_FailsStartValidation_NamingTheKey(string scenario, string expectedKey)
    {
        using var host = Build(Environments.Production, Scenario(scenario));

        var exception = Should.Throw<OptionsValidationException>(() => Validate(host));

        exception.Failures.ShouldContain(failure => failure.Contains(expectedKey, StringComparison.Ordinal));
        exception.Message.ShouldNotContain(Password);
        exception.Message.ShouldNotContain("wrong-" + Password);
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public void WithoutCertificate_OutsideDevelopment_FailsStartValidation(string environment)
    {
        using var host = Build(environment);

        Should.Throw<OptionsValidationException>(() => Validate(host)).Message.ShouldContain(DataProtectionSetup.CertificatePathKey);
    }

    [Theory]
    [InlineData("Development")]
    [InlineData("Production")]
    public void WithoutConnectionString_FailsStartValidation_InEveryEnvironment(string environment)
    {
        using var host = Build(environment, Current("keys"), connectionString: null);

        Should.Throw<OptionsValidationException>(() => Validate(host)).Failures
            .ShouldContain($"ConnectionStrings:{ConsoleDbContext.ConnectionName} is not configured.");
    }

    [Fact]
    public void Rotation_KeysEncryptedWithThePreviousCertificate_StayReadable()
    {
        using var hostA = Build(Environments.Production, Current("a"));
        var keyFromA = Encrypt(hostA, "key-written-under-a");
        var (pfxB, passwordB) = TestHostConfiguration.WriteKeyEncryptionCertificate(_directory, "b", Password);
        using var hostB = Build(Environments.Production, new()
        {
            [DataProtectionSetup.CertificatePathKey] = pfxB,
            [DataProtectionSetup.CertificatePasswordPathKey] = passwordB,
            [DataProtectionSetup.PreviousCertificatePathKey] = Path.Combine(_directory, "a.pfx"),
            [DataProtectionSetup.PreviousCertificatePasswordPathKey] = Path.Combine(_directory, "a.password"),
        });
        using var hostBOnly = Build(Environments.Production, new()
        {
            [DataProtectionSetup.CertificatePathKey] = pfxB,
            [DataProtectionSetup.CertificatePasswordPathKey] = passwordB,
        });

        Should.NotThrow(() => Validate(hostB));
        Decrypt(hostB, keyFromA).Value.ShouldBe("key-written-under-a");

        // New keys are encrypted with the current certificate only: a host without A reads them; A's keys it can't.
        Decrypt(hostBOnly, Encrypt(hostB, "key-written-under-b")).Value.ShouldBe("key-written-under-b");
        Should.Throw<Exception>(() => Decrypt(hostBOnly, keyFromA));
    }

    public void Dispose() => Directory.Delete(_directory, recursive: true);

    private Dictionary<string, string?> Current(string name)
    {
        var (pfxPath, passwordPath) = TestHostConfiguration.WriteKeyEncryptionCertificate(_directory, name, Password);
        return new()
        {
            [DataProtectionSetup.CertificatePathKey] = pfxPath,
            [DataProtectionSetup.CertificatePasswordPathKey] = passwordPath,
        };
    }

    private Dictionary<string, string?> Scenario(string scenario)
    {
        var settings = Current("keys");
        var missing = Path.Combine(_directory, "missing");
        var wrongPassword = Path.Combine(_directory, "wrong.password");
        File.WriteAllText(wrongPassword, "wrong-" + Password);
        switch (scenario)
        {
            case "missing-path":
                settings.Remove(DataProtectionSetup.CertificatePathKey);
                break;
            case "missing-file":
                settings[DataProtectionSetup.CertificatePathKey] = missing;
                break;
            case "missing-password-file":
                settings[DataProtectionSetup.CertificatePasswordPathKey] = missing;
                break;
            case "wrong-password":
                settings[DataProtectionSetup.CertificatePasswordPathKey] = wrongPassword;
                break;
            case "not-a-pfx":
                var text = Path.Combine(_directory, "not-a-pfx.pfx");
                File.WriteAllText(text, "not a certificate");
                settings[DataProtectionSetup.CertificatePathKey] = text;
                break;
            case "no-private-key":
                // A valid PKCS#12 file that holds only the public certificate.
                using (var full = X509CertificateLoader.LoadPkcs12FromFile(settings[DataProtectionSetup.CertificatePathKey]!, Password))
                using (var publicOnly = X509CertificateLoader.LoadCertificate(full.RawData))
                {
                    var path = Path.Combine(_directory, "public-only.pfx");
                    File.WriteAllBytes(path, publicOnly.Export(X509ContentType.Pkcs12, Password));
                    settings[DataProtectionSetup.CertificatePathKey] = path;
                }

                break;
            case "previous-missing-file":
                settings[DataProtectionSetup.PreviousCertificatePathKey] = missing;
                break;
            case "previous-wrong-password":
                settings[DataProtectionSetup.PreviousCertificatePathKey] = settings[DataProtectionSetup.CertificatePathKey];
                settings[DataProtectionSetup.PreviousCertificatePasswordPathKey] = wrongPassword;
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(scenario), scenario, null);
        }

        return settings;
    }

    private static IHost Build(
        string environment,
        Dictionary<string, string?>? settings = null,
        string? connectionString = "Host=unused.invalid;Database=unused")
    {
        var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
        {
            EnvironmentName = environment,
            DisableDefaults = true,
        });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            [$"ConnectionStrings:{ConsoleDbContext.ConnectionName}"] = connectionString,
            // Required outside Development (query cache, ADR-0040 §7); never connected to by these tests.
            ["ConnectionStrings:redis"] = "redis.invalid:6379",
        });
        builder.Configuration.AddInMemoryCollection(settings ?? []);
        builder.AddInfrastructure();
        return builder.Build();
    }

    /// <summary>What <c>IHost.StartAsync</c> runs first: every <c>ValidateOnStart</c> registration.</summary>
    private static void Validate(IHost host) => host.Services.GetRequiredService<IStartupValidator>().Validate();

    private static EncryptedXmlInfo Encrypt(IHost host, string secret)
    {
        var encryptor = host.Services.GetRequiredService<IOptions<KeyManagementOptions>>().Value.XmlEncryptor;
        return encryptor.ShouldBeOfType<CertificateXmlEncryptor>().Encrypt(new XElement("key", secret));
    }

    private static XElement Decrypt(IHost host, EncryptedXmlInfo encrypted) =>
        new EncryptedXmlDecryptor(host.Services).Decrypt(encrypted.EncryptedElement);
}
