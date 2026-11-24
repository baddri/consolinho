using FleetConsole.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.XmlEncryption;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FleetConsole.Infrastructure.Crypto;

/// <summary>
/// Configures ASP.NET Core Data Protection for the whole app (ADR-0004): one key ring, persisted in the console
/// database and, outside Development mandatorily (CFG-2, ADR-0028 §6), encrypted at rest with a certificate. Everything
/// that protects data uses it: SA token encryption (<see cref="DataProtectionTokenProtector"/>) and the session cookie,
/// whose handler resolves the same app-wide <see cref="IDataProtectionProvider"/>. Sessions therefore survive restarts
/// and are valid on every replica.
/// </summary>
internal static class DataProtectionSetup
{
    /// <summary>
    /// Isolates FleetConsole's payloads from other apps sharing a key ring and, more importantly, makes them independent of
    /// the content root path (the default discriminator), which differs between containers and machines.
    /// </summary>
    public const string ApplicationName = "FleetConsole";

    /// <summary>
    /// Key of the Postgres advisory lock under which every pod loads the key ring for the first time
    /// (<see cref="KeyRingWarmupService"/>), so concurrent cold starts create one shared first key, not one per pod
    /// (ADR-0030 amendment 2026-11-24). An arbitrary constant, distinct from <see cref="DatabaseMigrator.AdvisoryLockKey"/>.
    /// </summary>
    public const long KeyRingLockKey = 0x466C_6565_7444_504B; // "FleetDPK"

    /// <summary>Configuration key: path of a PKCS#12 (PFX) file whose certificate encrypts the keys at rest.</summary>
    public const string CertificatePathKey = "DataProtection:KeyEncryptionCertificatePath";

    /// <summary>Configuration key: path of a file holding the PFX password (optional; e.g. a mounted Secret).</summary>
    public const string CertificatePasswordPathKey = "DataProtection:KeyEncryptionCertificatePasswordPath";

    /// <summary>Configuration key: path of the retired PFX during a rotation (decryption only; OPS-2).</summary>
    public const string PreviousCertificatePathKey = "DataProtection:PreviousKeyEncryptionCertificatePath";

    /// <summary>Configuration key: path of the retired PFX's password file (optional).</summary>
    public const string PreviousCertificatePasswordPathKey = "DataProtection:PreviousKeyEncryptionCertificatePasswordPath";

    /// <summary>
    /// Registers Data Protection with the key ring in <see cref="ConsoleDbContext"/>, the validated
    /// <see cref="KeyEncryptionCertificateOptions"/> (checked on start) and key encryption with the loaded certificates.
    /// </summary>
    /// <remarks>
    /// Does what <c>ProtectKeysWithCertificate</c> + <c>UnprotectKeysWithAnyCertificate</c> do, but through options
    /// configuration instead of with certificates loaded at registration: the files are read only when Data Protection
    /// first resolves its options (ADR-0027 §2, ADR-0028 §6).
    /// </remarks>
    /// <param name="builder">The host builder.</param>
    public static void AddConsoleDataProtection(this IHostApplicationBuilder builder)
    {
        var dataProtection = builder.Services.AddDataProtection()
            .SetApplicationName(ApplicationName)
            .PersistKeysToDbContext<ConsoleDbContext>();

        builder.Services.AddOptions<KeyEncryptionCertificateOptions>()
            .BindConfiguration(KeyEncryptionCertificateOptions.SectionName)
            .ValidateOnStart();
        builder.Services.AddSingleton<IValidateOptions<KeyEncryptionCertificateOptions>, KeyEncryptionCertificateOptionsValidator>();
        builder.Services.AddSingleton<KeyEncryptionCertificates>();

        // Encryption: registered after PersistKeysToDbContext, so it runs after the repository is set (same order as
        // ProtectKeysWithCertificate).
        builder.Services.AddSingleton<IConfigureOptions<KeyManagementOptions>, KeyEncryptionConfiguration>();
        AddDecryptionCertificates(dataProtection);
    }

    /// <summary>Full name of the framework's internal hosted service that loads the key ring synchronously on start.</summary>
    private const string FrameworkKeyRingHostedServiceName = "Microsoft.AspNetCore.DataProtection.Internal.DataProtectionHostedService";

    /// <summary>
    /// Replaces the framework's start-time key-ring load with <see cref="KeyRingWarmupService"/>, which loads it in the
    /// background (T-0106, ADR-0028 §2) under a cross-pod lock, and adds the <c>keyring</c> readiness check
    /// (<see cref="KeyRingHealthCheck"/>) that keeps the pod unready until that load succeeded.
    /// </summary>
    /// <remarks>
    /// The framework's hosted service reads the key ring inside <c>StartAsync</c>, i.e. before Kestrel binds. With the
    /// database unreachable that read waits for EF's retrying execution strategy (~60 s), so <c>/alive</c> stays
    /// unanswered and the startup probe restarts the pod. Loading lazily changes nothing about key protection: the
    /// encryptor and decryptors configured above apply to every load, whenever it happens.
    /// <para>Every <c>AddDataProtection</c> call (e.g. by <c>AddAuthentication</c>) re-adds the framework service, so this
    /// must run after all service registrations. If a framework update renames the service, this throws at startup
    /// rather than silently bringing the blocking load back.</para>
    /// </remarks>
    /// <param name="services">The complete service collection.</param>
    public static void LoadKeyRingInBackground(IServiceCollection services)
    {
        var frameworkLoaders = services
            .Where(descriptor => descriptor.ServiceType == typeof(IHostedService)
                && descriptor.ImplementationType?.FullName == FrameworkKeyRingHostedServiceName)
            .ToList();
        if (frameworkLoaders.Count == 0)
        {
            throw new InvalidOperationException(
                $"'{FrameworkKeyRingHostedServiceName}' is not registered; call this after AddDataProtection, and check " +
                "whether a framework update renamed it (T-0106).");
        }

        foreach (var descriptor in frameworkLoaders)
        {
            services.Remove(descriptor);
        }

        services.AddSingleton<KeyRingWarmupState>();
        services.TryAddSingleton(new KeyRingWarmupOptions());
        services.AddHostedService<KeyRingWarmupService>();
        // Untagged: readiness (/health) only, never liveness (/alive).
        services.AddHealthChecks().AddCheck<KeyRingHealthCheck>(DependencyInjection.KeyRingHealthCheckName);
    }

    /// <summary>
    /// Registers the loaded certificates for key decryption, so keys can be read back without a machine certificate store.
    /// </summary>
    /// <remarks>
    /// The decryptor reads its certificates from <c>XmlKeyDecryptionOptions</c>, an internal type whose only public entry
    /// point, <c>UnprotectKeysWithAnyCertificate</c>, wants the certificates at registration time. So we let that
    /// extension register against a scratch collection once to learn the options-configuration service type, and
    /// register a factory for that type which runs the same extension with the loaded certificates on first resolve.
    /// Public API only; if a framework update changed the registration shape, the <c>Single</c> calls fail at startup
    /// and the key-ring tests fail.
    /// </remarks>
    private static void AddDecryptionCertificates(IDataProtectionBuilder dataProtection)
    {
        var configureType = ConfigureOptionsDescriptor(certificates: []).ServiceType;
        dataProtection.Services.AddSingleton(configureType, services =>
        {
            var certificates = services.GetRequiredService<KeyEncryptionCertificates>().DecryptionCertificates;
            return ConfigureOptionsDescriptor([.. certificates]).ImplementationInstance!;
        });
    }

    private static ServiceDescriptor ConfigureOptionsDescriptor(System.Security.Cryptography.X509Certificates.X509Certificate2[] certificates)
    {
        var scratch = new ServiceCollection();
        new ScratchBuilder(scratch).UnprotectKeysWithAnyCertificate(certificates);
        return scratch.Single(descriptor =>
            descriptor.ServiceType.IsConstructedGenericType
            && descriptor.ServiceType.GetGenericTypeDefinition() == typeof(IConfigureOptions<>));
    }

    /// <summary>Sets the key ring's encryptor to the current certificate, when there is one.</summary>
    /// <param name="certificates">The loaded certificates.</param>
    /// <param name="loggerFactory">For the encryptor's logs.</param>
    private sealed class KeyEncryptionConfiguration(KeyEncryptionCertificates certificates, ILoggerFactory loggerFactory)
        : IConfigureOptions<KeyManagementOptions>
    {
        /// <inheritdoc />
        public void Configure(KeyManagementOptions options)
        {
            if (certificates.Current is { } certificate)
            {
                options.XmlEncryptor = new CertificateXmlEncryptor(certificate, loggerFactory);
            }
        }
    }

    /// <summary>A Data Protection builder over an arbitrary service collection (see <see cref="AddDecryptionCertificates"/>).</summary>
    /// <param name="services">The collection.</param>
    private sealed class ScratchBuilder(IServiceCollection services) : IDataProtectionBuilder
    {
        /// <inheritdoc />
        public IServiceCollection Services => services;
    }
}
