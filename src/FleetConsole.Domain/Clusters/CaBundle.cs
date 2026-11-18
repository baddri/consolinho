using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Clusters;

/// <summary>
/// A cluster's CA bundle (CLU-2): the PEM text an admin pasted, plus a summary of every certificate it contains. When
/// set, the cluster API server's certificate must chain to one of these certificates (<see cref="ClusterTlsMode.CaBundle"/>).
/// The bundle is not secret and is returned by the API.
/// </summary>
/// <remarks>
/// <para>Instances only come from <see cref="Create"/>, so a <see cref="CaBundle"/> always holds at least one parseable
/// X.509 certificate. Errors are field errors on <see cref="FieldName"/> so forms can show them inline.</para>
/// <para>Equality compares <see cref="Pem"/> only: <see cref="Certificates"/> is derived from it. Cluster updates use this to
/// decide whether <c>caBundle</c> changed (CLU-4).</para>
/// </remarks>
public sealed record CaBundle
{
    /// <summary>The request/JSON field the bundle's validation errors are reported on.</summary>
    public const string FieldName = "caBundle";

    /// <summary>Maximum size of the PEM text in bytes (UTF-8), 256 KiB: far above any real bundle, small enough to keep in a row.</summary>
    public const int MaxSizeBytes = 256 * 1024;

    private CaBundle(string pem, IReadOnlyList<CaCertificateInfo> certificates)
    {
        Pem = pem;
        Certificates = certificates;
    }

    /// <summary>The PEM text with surrounding whitespace removed, otherwise exactly as entered.</summary>
    public string Pem { get; }

    /// <summary>The certificates of the bundle in PEM order; never empty.</summary>
    public IReadOnlyList<CaCertificateInfo> Certificates { get; }

    /// <summary>
    /// Parses <paramref name="pem"/> into a bundle. <c>CERTIFICATE</c> blocks are imported; other PEM blocks are ignored,
    /// except private keys, which are refused because the bundle is displayed to admins and returned by the API.
    /// </summary>
    /// <param name="pem">The PEM text from a register/update request. Callers treat blank as "no bundle" (system trust)
    /// before calling; a blank value here is an error.</param>
    /// <returns>The bundle, or a <see cref="ValidationError"/> keyed <see cref="FieldName"/>.</returns>
    public static Result<CaBundle> Create(string? pem)
    {
        var text = pem?.Trim();
        if (string.IsNullOrEmpty(text))
        {
            return FieldError("The CA bundle must contain at least one PEM certificate.");
        }

        if (Encoding.UTF8.GetByteCount(text) > MaxSizeBytes)
        {
            return FieldError("The CA bundle must be at most 256 KiB.");
        }

        if (ContainsPrivateKey(text))
        {
            return FieldError("The CA bundle must not contain a private key.");
        }

        var collection = new X509Certificate2Collection();
        try
        {
            collection.ImportFromPem(text);
            if (collection.Count == 0)
            {
                return FieldError("The CA bundle must contain at least one PEM certificate.");
            }

            var certificates = collection.Select(Describe).ToList();
            return new CaBundle(text, certificates.AsReadOnly());
        }
        catch (CryptographicException)
        {
            // A CERTIFICATE block whose base64 or DER content is malformed. The exception text is not user-facing.
            return FieldError("The CA bundle contains a certificate that can't be parsed.");
        }
        finally
        {
            foreach (var certificate in collection)
            {
                certificate.Dispose();
            }
        }
    }

    /// <summary>Value equality on <see cref="Pem"/> (ordinal); see the type remarks.</summary>
    /// <param name="other">The bundle to compare with.</param>
    /// <returns><see langword="true"/> when both hold the same PEM text.</returns>
    public bool Equals(CaBundle? other) => other is not null && string.Equals(Pem, other.Pem, StringComparison.Ordinal);

    /// <inheritdoc />
    public override int GetHashCode() => StringComparer.Ordinal.GetHashCode(Pem);

    /// <summary>Summarises the bundle without its PEM content, which is long and useless in logs.</summary>
    /// <returns>For example <c>CaBundle { 2 certificate(s) }</c>.</returns>
    public override string ToString() => $"CaBundle {{ {Certificates.Count} certificate(s) }}";

    private static ValidationError FieldError(string message) =>
        Error.Validation(new Dictionary<string, string[]> { [FieldName] = [message] });

    private static bool ContainsPrivateKey(string text)
    {
        // Walk every PEM block; labels are e.g. "PRIVATE KEY", "RSA PRIVATE KEY", "ENCRYPTED PRIVATE KEY".
        var remaining = text.AsSpan();
        while (PemEncoding.TryFind(remaining, out var fields))
        {
            if (remaining[fields.Label].Contains("PRIVATE KEY", StringComparison.Ordinal))
            {
                return true;
            }

            remaining = remaining[fields.Location.End..];
        }

        return false;
    }

    private static CaCertificateInfo Describe(X509Certificate2 certificate)
    {
        var hex = Convert.ToHexString(certificate.GetCertHash(HashAlgorithmName.SHA256));
        var fingerprint = string.Join(':', Enumerable.Range(0, hex.Length / 2).Select(i => hex.Substring(i * 2, 2)));
        return new CaCertificateInfo(
            certificate.Subject,
            certificate.Issuer,
            new DateTimeOffset(certificate.NotBefore.ToUniversalTime(), TimeSpan.Zero),
            new DateTimeOffset(certificate.NotAfter.ToUniversalTime(), TimeSpan.Zero),
            fingerprint);
    }
}
