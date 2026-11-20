using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Clusters;

/// <summary>
/// The connection settings of a cluster's Kubernetes API server: the URL and how its TLS certificate is verified
/// (CLU-1/2/3). Together they are what a connection test exercises, so any change to them makes stored test results
/// stale (CLU-4, <see cref="Cluster.ConnectionSettingsChangedAt"/>).
/// </summary>
/// <remarks>
/// <para>Instances only come from <see cref="Create"/>. Invariants: <see cref="Url"/> is an absolute <c>https://</c> URL
/// with a host and optional port and nothing else; a CA bundle and skipping TLS verification are mutually exclusive.</para>
/// <para>Errors are field errors keyed by the request JSON names (<c>apiUrl</c>, <c>caBundle</c>, <c>skipTlsVerify</c>);
/// all broken rules are reported at once.</para>
/// </remarks>
public sealed record ApiServerEndpoint
{
    /// <summary>The request/JSON field URL errors are reported on.</summary>
    public const string ApiUrlFieldName = "apiUrl";

    /// <summary>The request/JSON field the mutual-exclusion error is reported on.</summary>
    public const string SkipTlsVerifyFieldName = "skipTlsVerify";

    /// <summary>Maximum length of the API URL; also the column length.</summary>
    public const int MaxUrlLength = 2048;

    /// <summary>
    /// Constructor used by <see cref="Create"/> once every rule passed. Its parameter names match the properties, so
    /// persistence can bind it when materializing already-validated rows.
    /// </summary>
    private ApiServerEndpoint(Uri url, CaBundle? caBundle, bool skipTlsVerify)
    {
        Url = url;
        CaBundle = caBundle;
        SkipTlsVerify = skipTlsVerify;
    }

    /// <summary>
    /// The API server URL, scheme + host + optional port only (e.g. <c>https://api.prod-eu-1.example.com:6443</c>). Its
    /// canonical text form, without a trailing <c>/</c>, is <see cref="ToString"/>.
    /// </summary>
    public Uri Url { get; }

    /// <summary>The cluster's CA bundle, or <see langword="null"/> to use the system trust store (or when skipping verification).</summary>
    public CaBundle? CaBundle { get; }

    /// <summary>Whether TLS certificate verification is disabled (CLU-3). Never true together with a <see cref="CaBundle"/>.</summary>
    public bool SkipTlsVerify { get; }

    /// <summary>The verification mode derived from <see cref="CaBundle"/> and <see cref="SkipTlsVerify"/>.</summary>
    public ClusterTlsMode TlsMode =>
        SkipTlsVerify ? ClusterTlsMode.SkipVerify
        : CaBundle is not null ? ClusterTlsMode.CaBundle
        : ClusterTlsMode.SystemTrust;

    /// <summary>Validates the connection settings of a register/update request.</summary>
    /// <param name="url">The API URL. Surrounding whitespace is removed; a single trailing <c>/</c> is allowed and dropped.</param>
    /// <param name="caBundlePem">The CA bundle PEM; null or blank means "no bundle".</param>
    /// <param name="skipTlsVerify">Whether to skip TLS verification.</param>
    /// <returns>The endpoint, or a <see cref="ValidationError"/> with one entry per broken field.</returns>
    public static Result<ApiServerEndpoint> Create(string? url, string? caBundlePem, bool skipTlsVerify)
    {
        var errors = new Dictionary<string, string[]>();

        var urlResult = ParseUrl(url);
        if (urlResult.IsFailure)
        {
            errors[ApiUrlFieldName] = [urlResult.Error.Message];
        }

        CaBundle? caBundle = null;
        if (!string.IsNullOrWhiteSpace(caBundlePem))
        {
            var bundleResult = CaBundle.Create(caBundlePem);
            if (bundleResult.IsFailure)
            {
                foreach (var (field, messages) in ((ValidationError)bundleResult.Error).Errors)
                {
                    errors[field] = messages;
                }
            }
            else
            {
                caBundle = bundleResult.Value;
            }

            if (skipTlsVerify)
            {
                errors[SkipTlsVerifyFieldName] = ["Skip TLS verification and a CA bundle are mutually exclusive."];
            }
        }

        if (errors.Count > 0)
        {
            return Error.Validation(errors);
        }

        return new ApiServerEndpoint(urlResult.Value, caBundle, skipTlsVerify);
    }

    /// <summary>The canonical URL text without a trailing <c>/</c>, as returned by the API and stored in audit entries.</summary>
    /// <returns>For example <c>https://api.prod-eu-1.example.com:6443</c>.</returns>
    public override string ToString() => Url.GetLeftPart(UriPartial.Authority);

    private static Result<Uri> ParseUrl(string? value)
    {
        var text = value?.Trim();
        if (string.IsNullOrEmpty(text))
        {
            return InvalidUrl("API URL is required.");
        }

        if (text.Length > MaxUrlLength)
        {
            return InvalidUrl($"API URL must be at most {MaxUrlLength} characters long.");
        }

        if (!Uri.TryCreate(text, UriKind.Absolute, out var uri)
            || uri.Scheme != Uri.UriSchemeHttps
            || string.IsNullOrEmpty(uri.Host)
            || text.Any(char.IsWhiteSpace))
        {
            return InvalidUrl("API URL must be an absolute https:// URL.");
        }

        // Uri normalises away an empty query or fragment ("https://h/?" has Query ""), so the raw text is checked for
        // '?', '#' and '@' as well; none of them can legitimately appear in a scheme + host + port URL.
        if (uri.AbsolutePath != "/"
            || uri.Query.Length > 0 || uri.Fragment.Length > 0 || uri.UserInfo.Length > 0
            || text.IndexOfAny(['?', '#', '@']) >= 0)
        {
            return InvalidUrl("API URL must contain only a host and an optional port (no path, query, fragment or user info).");
        }

        return new Uri(uri.GetLeftPart(UriPartial.Authority), UriKind.Absolute);
    }

    private static Error InvalidUrl(string message) => Error.Validation("Clusters.InvalidApiUrl", message);
}
