using System.Diagnostics.CodeAnalysis;

namespace FleetConsole.Application.Proxy.Requests;

/// <summary>
/// The Kubernetes API path of a proxied request, validated against PRX-4 and still percent-encoded exactly as the
/// browser sent it (e.g. <c>/api/v1/namespaces/shop/pods</c>). It is forwarded byte for byte, so what was validated
/// is what the cluster sees: there is no decode/re-encode step that could smuggle a different path past the checks.
/// </summary>
/// <remarks>
/// Obtained only through <see cref="TryParse"/>, which rejects rather than rewrites (ADR-0019 §2). The query string is
/// not part of the path; it travels separately in <see cref="ProxyRequest.QueryString"/>.
/// </remarks>
public sealed record ProxyPath
{
    // First path segments the apiserver serves that a console needs. Compared case-sensitively, like the apiserver.
    private static readonly HashSet<string> AllowedRoots =
        new(StringComparer.Ordinal) { "api", "apis", "version", "openapi", ".well-known" };

    // Encoded '.', '/' and '\': decoded by some hop they could turn a harmless-looking path into a traversal.
    private static readonly string[] ForbiddenEscapes = ["%2e", "%2f", "%5c"];

    private ProxyPath(string value) => Value = value;

    /// <summary>The validated, still-encoded path; always starts with <c>/</c>.</summary>
    public string Value { get; }

    /// <summary>
    /// Validates a raw forwarded path (the request target minus the <c>/api/clusters/{cluster}/k8s</c> prefix).
    /// </summary>
    /// <param name="rawPath">The raw, still-encoded path without query string.</param>
    /// <param name="path">The validated path when accepted.</param>
    /// <returns>
    /// <see langword="false"/> for an empty path, a path not starting with <c>/</c>, any <c>%2e</c>/<c>%2f</c>/<c>%5c</c>
    /// (any case), <c>\</c>, <c>//</c> (which also covers a scheme or authority), a <c>.</c> or <c>..</c> segment,
    /// control characters (raw or percent-encoded), a malformed escape (<c>%</c> not followed by two hex digits — the
    /// apiserver answers those with 400, so classifying them would guess), <c>?</c>/<c>#</c>, or a first segment other than <c>api</c>, <c>apis</c>, <c>version</c>,
    /// <c>openapi</c>, <c>.well-known</c>. Other percent-escapes (e.g. <c>%3A</c>) are accepted unchanged.
    /// </returns>
    public static bool TryParse(string? rawPath, [NotNullWhen(true)] out ProxyPath? path)
    {
        path = null;
        if (string.IsNullOrEmpty(rawPath) || rawPath[0] != '/' || !HasOnlyAllowedCharacters(rawPath))
        {
            return false;
        }

        if (rawPath.Contains("//", StringComparison.Ordinal)
            || ForbiddenEscapes.Any(escape => rawPath.Contains(escape, StringComparison.OrdinalIgnoreCase))
            || !HasOnlyWellFormedEscapes(rawPath))
        {
            return false;
        }

        // "//" is already rejected, so the only empty segment possible is a trailing one ("/api/" is fine).
        var segments = rawPath[1..].Split('/');
        if (segments.Any(segment => segment is "." or "..") || !AllowedRoots.Contains(segments[0]))
        {
            return false;
        }

        path = new ProxyPath(rawPath);
        return true;
    }

    /// <summary>Returns <see cref="Value"/>, so the path can be logged or concatenated directly.</summary>
    /// <returns>The validated path.</returns>
    public override string ToString() => Value;

    // Every '%' must start "%XX"; encoded control characters are refused too, because classification and audit work on
    // decoded segments (KubernetesRequestInfo) and a decoded NUL/newline has no business in a resource name or a log.
    private static bool HasOnlyWellFormedEscapes(string rawPath)
    {
        for (var i = rawPath.IndexOf('%', StringComparison.Ordinal); i >= 0; i = rawPath.IndexOf('%', i + 1))
        {
            if (i + 2 >= rawPath.Length || !char.IsAsciiHexDigit(rawPath[i + 1]) || !char.IsAsciiHexDigit(rawPath[i + 2]))
            {
                return false;
            }

            var value = Convert.ToInt32(rawPath.Substring(i + 1, 2), 16);
            if (value < 0x20 || value == 0x7F)
            {
                return false;
            }
        }

        return true;
    }

    private static bool HasOnlyAllowedCharacters(string rawPath)
    {
        foreach (var c in rawPath)
        {
            if (c < 0x20 || c == 0x7F || c is '\\' or '?' or '#')
            {
                return false;
            }
        }

        return true;
    }
}
