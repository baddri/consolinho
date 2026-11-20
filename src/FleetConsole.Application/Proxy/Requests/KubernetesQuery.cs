using System.Text;

namespace FleetConsole.Application.Proxy.Requests;

/// <summary>
/// Reads a raw query string exactly the way the apiserver (Go <c>net/url.ParseQuery</c>) does, so the proxy classifies
/// <c>watch</c>, <c>follow</c>, <c>dryRun</c>, <c>fieldManager</c> and <c>timeoutSeconds</c> from the same values the
/// cluster will act on (ADR-0019 §4).
/// </summary>
/// <remarks>
/// Differences from <c>System.Web.HttpUtility.ParseQueryString</c> that matter for security: keys are compared
/// <b>case-sensitively</b> (<c>?Watch=0&amp;watch=1</c> is a watch upstream), pairs containing <c>;</c> or a malformed
/// escape are skipped (Go returns an error for them and ignores the pair), and the first value of a key wins.
/// </remarks>
internal static class KubernetesQuery
{
    /// <summary>
    /// Parses one <c>&amp;</c>-separated raw pair like Go's <c>ParseQuery</c>.
    /// </summary>
    /// <param name="rawPair">The raw pair, e.g. <c>labelSelector=app%3Dweb</c>.</param>
    /// <param name="key">The unescaped key.</param>
    /// <param name="value">The unescaped value (<c>""</c> when there is no <c>=</c>).</param>
    /// <returns><see langword="false"/> when Go would ignore the pair (empty, contains <c>;</c>, malformed escape).</returns>
    public static bool TryParsePair(string rawPair, out string key, out string value)
    {
        key = value = string.Empty;
        if (rawPair.Length == 0 || rawPair.Contains(';', StringComparison.Ordinal))
        {
            return false;
        }

        var separator = rawPair.IndexOf('=', StringComparison.Ordinal);
        var rawKey = separator < 0 ? rawPair : rawPair[..separator];
        var rawValue = separator < 0 ? string.Empty : rawPair[(separator + 1)..];
        return TryUnescape(rawKey, out key) && TryUnescape(rawValue, out value);
    }

    /// <summary>
    /// The first value of <paramref name="name"/> (exact, case-sensitive key match), like Go's <c>url.Values.Get</c>.
    /// </summary>
    /// <param name="queryString">The raw query string: <c>""</c> or starting with <c>?</c>.</param>
    /// <param name="name">The parameter name.</param>
    /// <returns>The decoded first value, or <see langword="null"/> when the parameter is absent.</returns>
    public static string? First(string queryString, string name)
    {
        foreach (var pair in Pairs(queryString))
        {
            if (TryParsePair(pair, out var key, out var value) && string.Equals(key, name, StringComparison.Ordinal))
            {
                return value;
            }
        }

        return null;
    }

    /// <summary>Splits a raw query string (with or without the leading <c>?</c>) into its raw pairs, empties included.</summary>
    /// <param name="queryString">The raw query string.</param>
    /// <returns>The raw pairs in order; none for <c>""</c> or <c>"?"</c>.</returns>
    public static string[] Pairs(string queryString)
    {
        var body = queryString.StartsWith('?') ? queryString[1..] : queryString;
        return body.Length == 0 ? [] : body.Split('&');
    }

    // Go's QueryUnescape: '+' is a space, every '%' must be followed by two hex digits.
    private static bool TryUnescape(string raw, out string decoded)
    {
        decoded = string.Empty;
        if (raw.IndexOfAny(['%', '+']) < 0)
        {
            decoded = raw;
            return true;
        }

        // '%', '+' and hex digits are ASCII, so working on the UTF-8 bytes keeps non-ASCII characters intact.
        var source = Encoding.UTF8.GetBytes(raw);
        var bytes = new List<byte>(source.Length);
        for (var i = 0; i < source.Length; i++)
        {
            var b = source[i];
            if (b == '%')
            {
                if (i + 2 >= source.Length || !IsHex(source[i + 1]) || !IsHex(source[i + 2]))
                {
                    return false;
                }

                bytes.Add((byte)((HexValue(source[i + 1]) << 4) | HexValue(source[i + 2])));
                i += 2;
            }
            else
            {
                bytes.Add(b == '+' ? (byte)' ' : b);
            }
        }

        decoded = Encoding.UTF8.GetString([.. bytes]);
        return true;
    }

    private static bool IsHex(byte b) => char.IsAsciiHexDigit((char)b);

    private static int HexValue(byte b) => Convert.ToInt32(((char)b).ToString(), 16);
}
