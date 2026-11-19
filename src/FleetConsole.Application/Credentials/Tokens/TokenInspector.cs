using System.Buffers.Text;
using System.Text.Json;
using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Credentials.Tokens;

/// <summary>
/// Reads the display metadata of a ServiceAccount token (CRED-3): whether it is a JWT and, if so, its <c>sub</c>,
/// <c>iat</c> and <c>exp</c> claims. Called when a credential is added or rotated (and by the connection test of an
/// unsaved token, T-0020); the result is stored as the credential's <see cref="TokenMetadata"/>.
/// </summary>
/// <remarks>
/// <para><b>No signature validation, on purpose.</b> FleetConsole can't verify a cluster's signing keys and doesn't
/// need to: the metadata is for display (identity, expiry warnings, CRED-4/8) and the cluster decides whether the token
/// is valid. Never base an authorization decision on it.</para>
/// <para><b>What counts as a JWT:</b> exactly three <c>.</c>-separated base64url segments (the signature may be empty)
/// whose header decodes to a JSON object with a string <c>alg</c> and whose payload decodes to a JSON object. Anything
/// else — opaque OpenShift tokens (<c>sha256~…</c>), JWE (five segments), garbage — is <see cref="TokenMetadata.Opaque"/>.
/// Opaque tokens are accepted (Q10); the UI warns that their identity and expiry are unknown.</para>
/// <para><b>Claims.</b> <c>sub</c> is used when it is a non-empty string, <c>iat</c> when it is a valid NumericDate
/// (RFC 7519: seconds since the epoch, possibly fractional; fractions are truncated), otherwise they are
/// <see langword="null"/>. A present but invalid <c>exp</c> (not a number, out of range) makes the whole token
/// <see cref="TokenMetadata.Opaque"/>: reporting it as "no expiry" would hide a token that may well expire, while
/// "opaque" shows the honest "unknown" status.</para>
/// <para><b>Never throws</b> for any input, and never puts token content into an exception or log: parse failures are
/// caught and simply mean "opaque".</para>
/// </remarks>
public static class TokenInspector
{
    // DateTimeOffset's range in Unix seconds; NumericDates outside it can't be represented.
    private static readonly long MinUnixSeconds = DateTimeOffset.MinValue.ToUnixTimeSeconds();
    private static readonly long MaxUnixSeconds = DateTimeOffset.MaxValue.ToUnixTimeSeconds();

    /// <summary>Inspects <paramref name="token"/> and returns its display metadata.</summary>
    /// <param name="token">The plaintext token, as it will be stored (already trimmed).</param>
    /// <returns>JWT metadata, or <see cref="TokenMetadata.Opaque"/> when the token is not a readable JWT.</returns>
    public static TokenMetadata Inspect(SensitiveString token)
    {
        ArgumentNullException.ThrowIfNull(token);

        var segments = token.Reveal().Split('.');
        if (segments is not [{ Length: > 0 } header, { Length: > 0 } payload, var signature]
            || !Base64Url.IsValid(signature))
        {
            return TokenMetadata.Opaque;
        }

        try
        {
            using var headerJson = ParseObject(header);
            if (headerJson is null
                || !headerJson.RootElement.TryGetProperty("alg", out var alg)
                || alg.ValueKind != JsonValueKind.String)
            {
                return TokenMetadata.Opaque;
            }

            using var payloadJson = ParseObject(payload);
            if (payloadJson is null)
            {
                return TokenMetadata.Opaque;
            }

            var claims = payloadJson.RootElement;
            DateTimeOffset? expiresAt = null;
            if (claims.TryGetProperty("exp", out var exp))
            {
                expiresAt = ReadNumericDate(exp);
                if (expiresAt is null)
                {
                    // Present but unreadable: the expiry is unknown, not absent (see remarks).
                    return TokenMetadata.Opaque;
                }
            }

            var subject = claims.TryGetProperty("sub", out var sub) && sub.ValueKind == JsonValueKind.String && sub.GetString() is { Length: > 0 } s
                ? s
                : null;
            var issuedAt = claims.TryGetProperty("iat", out var iat) ? ReadNumericDate(iat) : null;

            return new TokenMetadata(TokenType.Jwt, subject, issuedAt, expiresAt);
        }
        catch (JsonException)
        {
            // A segment decoded to malformed (or too deeply nested) JSON: treat as opaque. The exception message is
            // dropped on purpose; it can quote parts of the token.
            return TokenMetadata.Opaque;
        }
    }

    /// <summary>
    /// Decodes a base64url segment and parses it as a JSON object; <see langword="null"/> when it is not valid base64url
    /// or not a JSON object. Throws <see cref="JsonException"/> for malformed JSON (the caller treats it as opaque).
    /// </summary>
    private static JsonDocument? ParseObject(string segment)
    {
        if (!Base64Url.IsValid(segment))
        {
            return null;
        }

        var bytes = Base64Url.DecodeFromChars(segment);
        var document = JsonDocument.Parse(bytes);
        if (document.RootElement.ValueKind == JsonValueKind.Object)
        {
            return document;
        }

        document.Dispose();
        return null;
    }

    /// <summary>
    /// Reads an RFC 7519 NumericDate: a JSON number of seconds since the Unix epoch, fractions truncated. Returns
    /// <see langword="null"/> for anything else (strings, non-finite or out-of-range values).
    /// </summary>
    private static DateTimeOffset? ReadNumericDate(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Number)
        {
            return null;
        }

        long seconds;
        if (value.TryGetInt64(out var whole))
        {
            seconds = whole;
        }
        else if (value.TryGetDouble(out var fractional) && double.IsFinite(fractional)
                 && fractional >= MinUnixSeconds && fractional <= MaxUnixSeconds)
        {
            seconds = (long)Math.Floor(fractional);
        }
        else
        {
            return null;
        }

        return seconds >= MinUnixSeconds && seconds <= MaxUnixSeconds
            ? DateTimeOffset.FromUnixTimeSeconds(seconds)
            : null;
    }
}
