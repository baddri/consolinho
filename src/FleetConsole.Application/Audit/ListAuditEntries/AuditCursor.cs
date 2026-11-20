using System.Buffers.Text;
using System.Globalization;
using System.Text;
using FleetConsole.Domain.Audit;

namespace FleetConsole.Application.Audit.ListAuditEntries;

/// <summary>
/// The keyset position behind the opaque audit-log cursor (ADR-0013 §7): the <c>(OccurredAt, Id)</c> of the last entry
/// of a page. The next page continues strictly below it in the <c>OccurredAt DESC, Id DESC</c> order, so entries
/// written meanwhile (always newer) never shift it.
/// </summary>
/// <remarks>
/// Encoded as base64url of <c>"{occurredAt:O}|{id}"</c>. Opaque to clients and not signed: a forged cursor only selects
/// a different starting point of a list the caller may read anyway.
/// </remarks>
/// <param name="OccurredAt">Timestamp of the last entry of the previous page.</param>
/// <param name="Id">Id of the last entry of the previous page (tiebreaker for equal timestamps).</param>
public readonly record struct AuditCursor(DateTimeOffset OccurredAt, AuditEntryId Id)
{
    // Issued cursors are ~90 characters; anything much longer is not ours and is refused before decoding.
    private const int MaxEncodedLength = 256;

    // Rejects invalid UTF-8 instead of substituting U+FFFD, so garbage never parses by accident.
    private static readonly UTF8Encoding StrictUtf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);

    /// <summary>Encodes the cursor for <see cref="AuditPageDto.NextCursor"/>.</summary>
    /// <returns>A URL-safe opaque string.</returns>
    public string Encode() =>
        Base64Url.EncodeToString(Encoding.UTF8.GetBytes(
            string.Create(CultureInfo.InvariantCulture, $"{OccurredAt.ToUniversalTime():O}|{Id.Value:D}")));

    /// <summary>Decodes a cursor received from a client.</summary>
    /// <param name="value">The opaque value.</param>
    /// <param name="cursor">The decoded position when the value is well-formed.</param>
    /// <returns><see langword="true"/> when <paramref name="value"/> is a cursor this API issued (structurally).</returns>
    public static bool TryParse(string? value, out AuditCursor cursor)
    {
        cursor = default;
        if (string.IsNullOrEmpty(value) || value.Length > MaxEncodedLength || !TryBase64UrlDecode(value, out var text))
        {
            return false;
        }

        var separator = text.IndexOf('|', StringComparison.Ordinal);
        if (separator < 0
            || !DateTimeOffset.TryParseExact(
                text[..separator], "O", CultureInfo.InvariantCulture, DateTimeStyles.None, out var occurredAt)
            || !Guid.TryParseExact(text[(separator + 1)..], "D", out var id)
            || id == Guid.Empty)
        {
            return false;
        }

        // Issued cursors are UTC, but the value is client-controlled: a tampered offset would reach Npgsql, which
        // refuses non-UTC DateTimeOffset parameters for timestamptz (a 500). Normalizing keeps the same instant.
        cursor = new AuditCursor(occurredAt.ToUniversalTime(), new AuditEntryId(id));
        return true;
    }

    private static bool TryBase64UrlDecode(string value, out string text)
    {
        text = string.Empty;
        // TryDecodeFromChars throws (rather than returning false) on characters outside the alphabet; check first.
        if (!Base64Url.IsValid(value))
        {
            return false;
        }

        var buffer = new byte[Base64Url.GetMaxDecodedLength(value.Length)];
        if (!Base64Url.TryDecodeFromChars(value, buffer, out var written))
        {
            return false;
        }

        try
        {
            text = StrictUtf8.GetString(buffer, 0, written);
            return true;
        }
        catch (DecoderFallbackException)
        {
            return false;
        }
    }
}
