using System.Security.Cryptography.X509Certificates;
using Microsoft.Extensions.Options;

namespace FleetConsole.Infrastructure.Crypto;

/// <summary>
/// The loaded key-encryption certificates (singleton): <see cref="Current"/> encrypts new Data Protection keys and,
/// with <see cref="Previous"/> during a rotation (OPS-2), decrypts existing ones. Created on first use, i.e. when Data
/// Protection first reads its options — after the startup validation — so neither service registration nor the
/// <c>migrate</c> mode touches the mounted files (ADR-0027 §2). Disposed with the container.
/// </summary>
internal sealed class KeyEncryptionCertificates : IDisposable
{
    /// <summary>Loads the configured certificates.</summary>
    /// <param name="options">The certificate paths; resolving them runs their validation.</param>
    /// <exception cref="OptionsValidationException">The configuration is invalid.</exception>
    /// <exception cref="InvalidOperationException">A file changed between validation and loading.</exception>
    public KeyEncryptionCertificates(IOptions<KeyEncryptionCertificateOptions> options)
    {
        ArgumentNullException.ThrowIfNull(options);
        var settings = options.Value;
        Current = Load(
            settings.KeyEncryptionCertificatePath, settings.KeyEncryptionCertificatePasswordPath,
            DataProtectionSetup.CertificatePathKey, DataProtectionSetup.CertificatePasswordPathKey);
        Previous = Load(
            settings.PreviousKeyEncryptionCertificatePath, settings.PreviousKeyEncryptionCertificatePasswordPath,
            DataProtectionSetup.PreviousCertificatePathKey, DataProtectionSetup.PreviousCertificatePasswordPathKey);
    }

    /// <summary>The certificate that encrypts new keys; null only in Development without configuration.</summary>
    public X509Certificate2? Current { get; }

    /// <summary>The retired certificate kept for decrypting the keys it encrypted; null when no rotation is going on.</summary>
    public X509Certificate2? Previous { get; }

    /// <summary>Every certificate that may decrypt stored keys (current first).</summary>
    public IReadOnlyList<X509Certificate2> DecryptionCertificates =>
        new[] { Current, Previous }.OfType<X509Certificate2>().ToArray();

    /// <inheritdoc />
    public void Dispose()
    {
        Current?.Dispose();
        Previous?.Dispose();
    }

    private static X509Certificate2? Load(string? path, string? passwordPath, string pathKey, string passwordPathKey)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        return KeyEncryptionCertificateLoader.TryLoad(path, passwordPath, pathKey, passwordPathKey, out var certificate, out var error)
            ? certificate
            : throw new InvalidOperationException(error);
    }
}
