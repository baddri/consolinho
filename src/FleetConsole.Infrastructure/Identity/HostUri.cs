namespace FleetConsole.Infrastructure.Identity;

/// <summary>Resolves paths relative to a configured base URL, keeping any path prefix of the base.</summary>
internal static class HostUri
{
    /// <summary>
    /// <paramref name="relativePath"/> under <paramref name="baseUri"/>: <c>https://h/prefix</c> + <c>a/b</c> →
    /// <c>https://h/prefix/a/b</c> (plain <c>new Uri(base, rel)</c> would drop <c>prefix</c> without a trailing slash).
    /// </summary>
    /// <param name="baseUri">An absolute base URL.</param>
    /// <param name="relativePath">A path without leading slash.</param>
    /// <returns>The absolute URL.</returns>
    public static Uri Resolve(Uri baseUri, string relativePath)
    {
        var text = baseUri.AbsoluteUri;
        var withSlash = text.EndsWith('/') ? baseUri : new Uri(text + "/");
        return new Uri(withSlash, relativePath);
    }
}
