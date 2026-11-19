using System.Security.Cryptography;
using System.Text;
using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Credentials.Tokens;

/// <summary>
/// Computes a token's <see cref="TokenFingerprint"/>: the first 8 lowercase hex characters of the SHA-256 of its UTF-8
/// bytes (ADR-0004). The only place the rule lives, so credentials added through the API, rotated tokens, tested
/// unsaved tokens (T-0020) and test fixtures all agree.
/// </summary>
/// <remarks>
/// 32 bits of a hash reveal nothing usable about the token; they only let admins tell tokens apart (CRED-3) and see the
/// old→new change of a rotation in the audit log (CRED-5). The UTF-8 copy of the plaintext is zeroed after hashing.
/// </remarks>
public static class TokenFingerprints
{
    /// <summary>Computes the fingerprint of <paramref name="token"/>.</summary>
    /// <param name="token">The plaintext token, as it will be stored (already trimmed).</param>
    /// <returns>The fingerprint.</returns>
    public static TokenFingerprint Compute(SensitiveString token)
    {
        ArgumentNullException.ThrowIfNull(token);

        var bytes = Encoding.UTF8.GetBytes(token.Reveal());
        Span<byte> hash = stackalloc byte[SHA256.HashSizeInBytes];
        try
        {
            SHA256.HashData(bytes, hash);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
        }

        // 8 hex characters = the first 4 bytes of the hash.
        var hex = Convert.ToHexStringLower(hash[..(TokenFingerprint.Length / 2)]);

        // Create can only fail for a malformed value, i.e. a bug in this method; surface it loudly.
        var fingerprint = TokenFingerprint.Create(hex);
        return fingerprint.IsSuccess
            ? fingerprint.Value
            : throw new InvalidOperationException($"Computed an invalid token fingerprint: {fingerprint.Error.Message}");
    }
}
