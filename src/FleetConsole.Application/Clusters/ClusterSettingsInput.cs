using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Clusters;

/// <summary>
/// Turns the raw request values of <see cref="IClusterSettings"/> into the values <see cref="Cluster.Register"/> and
/// <see cref="Cluster.Update"/> take. Used by the validator rules (to decide what is valid) and by the handlers (to build
/// the values), so both agree on trimming and blank-means-none.
/// </summary>
internal static class ClusterSettingsInput
{
    /// <summary>
    /// Trims free text; null, empty or whitespace becomes <see langword="null"/> (the aggregate then applies its default,
    /// e.g. display name = cluster name).
    /// </summary>
    /// <param name="value">The raw value.</param>
    /// <returns>The trimmed value, or <see langword="null"/>.</returns>
    public static string? Text(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// Parses the optional web console URL: an absolute <c>https://</c> URL with a host and no whitespace, at most
    /// <see cref="Cluster.MaxWebConsoleUrlLength"/> characters after trimming. Blank means "no link".
    /// </summary>
    /// <param name="value">The raw value.</param>
    /// <param name="url">The parsed URL, or <see langword="null"/> when blank or invalid.</param>
    /// <returns><see langword="true"/> when the value is blank or a valid URL; <see langword="false"/> when invalid.</returns>
    public static bool TryParseWebConsoleUrl(string? value, out Uri? url)
    {
        url = null;
        var text = Text(value);
        if (text is null)
        {
            return true;
        }

        if (text.Length > Cluster.MaxWebConsoleUrlLength
            || text.Any(char.IsWhiteSpace)
            || !Uri.TryCreate(text, UriKind.Absolute, out var parsed)
            || parsed.Scheme != Uri.UriSchemeHttps
            || string.IsNullOrEmpty(parsed.Host))
        {
            return false;
        }

        url = parsed;
        return true;
    }

    /// <summary>
    /// The web console URL for the aggregate, for handlers: the validator has already refused invalid values, so one
    /// reaching here means the pipeline was bypassed (a bug).
    /// </summary>
    /// <param name="value">The raw value.</param>
    /// <returns>The URL, or <see langword="null"/> when blank.</returns>
    /// <exception cref="InvalidOperationException">When the value is invalid.</exception>
    public static Uri? WebConsoleUrl(string? value) =>
        TryParseWebConsoleUrl(value, out var url)
            ? url
            : throw new InvalidOperationException("An invalid web console URL reached a cluster handler; the validator must refuse it.");

    /// <summary>
    /// Builds the connection settings value object. Its factory is the single source of the URL, CA bundle and
    /// skip-TLS rules; on failure it returns a <see cref="ValidationError"/> keyed by the JSON field names
    /// (<c>apiUrl</c>, <c>caBundle</c>, <c>skipTlsVerify</c>).
    /// </summary>
    /// <param name="settings">The request.</param>
    /// <returns>The endpoint, or the field errors.</returns>
    public static Result<ApiServerEndpoint> Endpoint(IClusterSettings settings) =>
        ApiServerEndpoint.Create(settings.ApiUrl, settings.CaBundle, settings.SkipTlsVerify);
}
