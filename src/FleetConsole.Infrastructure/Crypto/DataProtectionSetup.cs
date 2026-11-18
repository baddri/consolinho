using System.Security.Cryptography.X509Certificates;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace FleetConsole.Infrastructure.Crypto;

/// <summary>
/// Configures ASP.NET Core Data Protection for the whole app (ADR-0004): one key ring, persisted in the console
/// database, optionally encrypted at rest with a certificate. Everything that protects data uses it: SA token encryption
/// (<see cref="DataProtectionTokenProtector"/>) and the session cookie, whose handler resolves the same app-wide
/// <see cref="IDataProtectionProvider"/>. Sessions therefore survive restarts and are valid on every replica.
/// </summary>
internal static class DataProtectionSetup
{
    /// <summary>
    /// Isolates FleetConsole's payloads from other apps sharing a key ring and, more importantly, makes them independent of
    /// the content root path (the default discriminator), which differs between containers and machines.
    /// </summary>
    public const string ApplicationName = "FleetConsole";

    /// <summary>Configuration key: path of a PKCS#12 (PFX) file whose certificate encrypts the keys at rest.</summary>
    public const string CertificatePathKey = "DataProtection:KeyEncryptionCertificatePath";

    /// <summary>Configuration key: path of a file holding the PFX password (optional; e.g. a mounted Secret).</summary>
    public const string CertificatePasswordPathKey = "DataProtection:KeyEncryptionCertificatePasswordPath";

    /// <summary>
    /// Registers Data Protection with the key ring in <see cref="ConsoleDbContext"/> and, when
    /// <see cref="CertificatePathKey"/> is set, key encryption with that certificate. Without a certificate outside
    /// Development, a warning is logged at startup (<see cref="UnprotectedKeyRingWarning"/>; mandatory from CP3).
    /// </summary>
    /// <param name="builder">The host builder.</param>
    /// <exception cref="InvalidOperationException">When the configured certificate can't be used (no private key).</exception>
    public static void AddConsoleDataProtection(this IHostApplicationBuilder builder)
    {
        var dataProtection = builder.Services.AddDataProtection()
            .SetApplicationName(ApplicationName)
            .PersistKeysToDbContext<ConsoleDbContext>();

        var certificatePath = builder.Configuration[CertificatePathKey];
        if (!string.IsNullOrWhiteSpace(certificatePath))
        {
            // Also registers the certificate for decryption, so keys it encrypted can be read back without a cert store.
            dataProtection.ProtectKeysWithCertificate(
                LoadCertificate(certificatePath, builder.Configuration[CertificatePasswordPathKey]));
        }
        else if (!builder.Environment.IsDevelopment())
        {
            builder.Services.AddHostedService<UnprotectedKeyRingWarning>();
        }
    }

    private static X509Certificate2 LoadCertificate(string path, string? passwordPath)
    {
        // Secrets mounted from files usually end with a newline that is not part of the password.
        var password = string.IsNullOrWhiteSpace(passwordPath) ? null : File.ReadAllText(passwordPath).TrimEnd('\r', '\n');
        var certificate = X509CertificateLoader.LoadPkcs12FromFile(path, password);
        if (!certificate.HasPrivateKey)
        {
            certificate.Dispose();
            throw new InvalidOperationException(
                $"The certificate in '{CertificatePathKey}' has no private key, so it could not decrypt the Data Protection keys.");
        }

        return certificate;
    }
}
