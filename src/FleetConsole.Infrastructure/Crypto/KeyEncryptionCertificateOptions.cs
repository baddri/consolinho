using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FleetConsole.Infrastructure.Crypto;

/// <summary>
/// The certificates that encrypt the Data Protection key ring at rest (section <c>DataProtection</c>, ADR-0004,
/// ADR-0028 §6, CFG-2). Only file paths live in configuration: the PFX and its password are mounted Secrets. The files
/// are read when the options are validated on start and by <see cref="KeyEncryptionCertificates"/>, never during
/// service registration, so the <c>migrate</c> mode (ADR-0027) starts without them.
/// </summary>
internal sealed class KeyEncryptionCertificateOptions
{
    /// <summary>Configuration section of the Data Protection settings.</summary>
    public const string SectionName = "DataProtection";

    /// <summary>
    /// Path of the PKCS#12 (PFX) file whose RSA certificate encrypts new keys and decrypts existing ones. Required
    /// outside Development; without it Development keeps the key ring unencrypted.
    /// </summary>
    public string? KeyEncryptionCertificatePath { get; set; }

    /// <summary>Path of a file holding the PFX password (optional; a trailing newline is ignored).</summary>
    public string? KeyEncryptionCertificatePasswordPath { get; set; }

    /// <summary>
    /// Path of the retired PFX during a certificate rotation (OPS-2): used only to decrypt keys it encrypted, never to
    /// encrypt. Optional.
    /// </summary>
    public string? PreviousKeyEncryptionCertificatePath { get; set; }

    /// <summary>Path of the password file of <see cref="PreviousKeyEncryptionCertificatePath"/> (optional).</summary>
    public string? PreviousKeyEncryptionCertificatePasswordPath { get; set; }
}

/// <summary>
/// Startup validation of <see cref="KeyEncryptionCertificateOptions"/> (ADR-0028 §6): outside Development the current
/// certificate is required; every configured certificate must exist, load as PKCS#12 with its optional password file
/// and hold an RSA private key. Messages name the configuration key, never a password.
/// </summary>
/// <param name="environment">The host environment (the certificate is optional only in Development).</param>
internal sealed class KeyEncryptionCertificateOptionsValidator(IHostEnvironment environment)
    : IValidateOptions<KeyEncryptionCertificateOptions>
{
    /// <inheritdoc />
    public ValidateOptionsResult Validate(string? name, KeyEncryptionCertificateOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        var failures = new List<string>();

        if (string.IsNullOrWhiteSpace(options.KeyEncryptionCertificatePath))
        {
            if (!environment.IsDevelopment())
            {
                failures.Add(
                    $"{DataProtectionSetup.CertificatePathKey} is required outside Development: the Data Protection key " +
                    "ring (SA tokens, session keys) must be encrypted at rest.");
            }
        }
        else
        {
            CheckLoadable(
                options.KeyEncryptionCertificatePath, options.KeyEncryptionCertificatePasswordPath,
                DataProtectionSetup.CertificatePathKey, DataProtectionSetup.CertificatePasswordPathKey, failures);
        }

        if (!string.IsNullOrWhiteSpace(options.PreviousKeyEncryptionCertificatePath))
        {
            CheckLoadable(
                options.PreviousKeyEncryptionCertificatePath, options.PreviousKeyEncryptionCertificatePasswordPath,
                DataProtectionSetup.PreviousCertificatePathKey, DataProtectionSetup.PreviousCertificatePasswordPathKey, failures);
        }

        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }

    private static void CheckLoadable(string path, string? passwordPath, string pathKey, string passwordPathKey, List<string> failures)
    {
        // Loads once to prove it works and disposes; KeyEncryptionCertificates loads the instance that is used.
        if (KeyEncryptionCertificateLoader.TryLoad(path, passwordPath, pathKey, passwordPathKey, out var certificate, out var error))
        {
            certificate.Dispose();
        }
        else
        {
            failures.Add(error);
        }
    }
}

/// <summary>
/// Loads a key-encryption certificate from a PFX file and an optional password file, turning every failure into a
/// message that names the configuration keys (never the password or the exception text, which might echo input).
/// </summary>
internal static class KeyEncryptionCertificateLoader
{
    /// <summary>Loads and checks the certificate.</summary>
    /// <param name="path">Path of the PFX file.</param>
    /// <param name="passwordPath">Path of the password file, or null/blank for a PFX without password.</param>
    /// <param name="pathKey">Configuration key of <paramref name="path"/>, for the error message.</param>
    /// <param name="passwordPathKey">Configuration key of <paramref name="passwordPath"/>, for the error message.</param>
    /// <param name="certificate">The certificate with its RSA private key on success; the caller owns it.</param>
    /// <param name="error">Why it can't be used, on failure.</param>
    /// <returns>Whether the certificate can encrypt and decrypt keys.</returns>
    public static bool TryLoad(
        string path,
        string? passwordPath,
        string pathKey,
        string passwordPathKey,
        [System.Diagnostics.CodeAnalysis.NotNullWhen(true)] out X509Certificate2? certificate,
        [System.Diagnostics.CodeAnalysis.NotNullWhen(false)] out string? error)
    {
        certificate = null;
        if (!File.Exists(path))
        {
            error = $"{pathKey} points to a file that does not exist.";
            return false;
        }

        string? password = null;
        if (!string.IsNullOrWhiteSpace(passwordPath))
        {
            if (!File.Exists(passwordPath))
            {
                error = $"{passwordPathKey} points to a file that does not exist.";
                return false;
            }

            try
            {
                // Secrets mounted from files usually end with a newline that is not part of the password.
                password = File.ReadAllText(passwordPath).TrimEnd('\r', '\n');
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                error = $"{passwordPathKey} could not be read.";
                return false;
            }
        }

        X509Certificate2 loaded;
        try
        {
            loaded = X509CertificateLoader.LoadPkcs12FromFile(path, password);
        }
        catch (Exception exception) when (exception is CryptographicException or IOException or UnauthorizedAccessException)
        {
            error = $"{pathKey} could not be loaded as a PKCS#12 (PFX) file with the password from {passwordPathKey} " +
                    "(wrong password, unreadable file or not a PFX).";
            return false;
        }

        // EncryptedXml transports the key with RSA, so only an RSA private key can encrypt and decrypt the key ring.
        using (var rsa = loaded.GetRSAPrivateKey())
        {
            if (rsa is null)
            {
                loaded.Dispose();
                error = $"{pathKey} holds a certificate without an RSA private key, so it could not decrypt the Data Protection keys.";
                return false;
            }
        }

        certificate = loaded;
        error = null;
        return true;
    }
}
