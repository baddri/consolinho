namespace FleetConsole.Api.Auth;

/// <summary>
/// Decides where the browser may be sent after login (AUTH-2, contract §4.1, SECURITY.md): only a local path of this
/// origin, never another site. Applied to the <c>returnUrl</c> of <c>GET /api/auth/login</c> and again on the OAuth
/// callback, so an open redirect is impossible even if a value reaches the callback another way.
/// </summary>
/// <remarks>
/// <para>Accepted: values that start with exactly one <c>/</c>, contain no <c>\</c> and consist only of visible ASCII
/// characters (which also excludes control characters, spaces and anything a <c>Location</c> header can't carry). A
/// value starting with one <c>/</c> can't carry a scheme. Everything else, including <c>//host</c>, <c>/\host</c>,
/// absolute URLs and still-encoded values such as <c>%2F%2Fhost</c>, becomes <see cref="Root"/>.</para>
/// <para>The SPA computes its <c>returnUrl</c> with the same rule (ADR-0014), so a sanitized value only differs from
/// the requested one for hostile or broken input.</para>
/// </remarks>
public static class ReturnUrlPolicy
{
    /// <summary>The fallback: the SPA's start page.</summary>
    public const string Root = "/";

    /// <summary>Longest accepted value; longer ones are not legitimate SPA locations.</summary>
    public const int MaxLength = 2048;

    /// <summary>Returns <paramref name="returnUrl"/> when it is a safe local path, otherwise <see cref="Root"/>.</summary>
    /// <param name="returnUrl">The requested return URL (may be null or empty).</param>
    /// <returns>A local path starting with a single <c>/</c>.</returns>
    public static string Sanitize(string? returnUrl)
    {
        if (string.IsNullOrEmpty(returnUrl) || returnUrl.Length > MaxLength || returnUrl[0] != '/')
        {
            return Root;
        }

        // "//host" is a protocol-relative URL to another site.
        if (returnUrl.Length > 1 && returnUrl[1] == '/')
        {
            return Root;
        }

        foreach (var c in returnUrl)
        {
            // Browsers treat "\" like "/" ("/\host" → "//host"); outside visible ASCII are control characters, spaces
            // and characters a Location header can't carry.
            if (c == '\\' || c < '!' || c > '~')
            {
                return Root;
            }
        }

        return returnUrl;
    }
}
