using FleetConsole.Infrastructure.Identity;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Auth;

/// <summary>
/// Fills the configuration-dependent parts of <see cref="OpenShiftOAuthOptions"/> (ADR-0010): the client credentials
/// from <see cref="OpenShiftHostOptions"/> and the <see cref="OpenShiftHostHttpClient.Name"/> client as backchannel (no
/// retries, host CA trust, 10 s timeout).
/// </summary>
/// <remarks>
/// <para><b>Endpoints are not options.</b> <see cref="Microsoft.AspNetCore.Authentication.OAuth.OAuthOptions.AuthorizationEndpoint"/> and
/// <see cref="Microsoft.AspNetCore.Authentication.OAuth.OAuthOptions.TokenEndpoint"/> hold fixed placeholders under <see cref="UnavailableHost"/> (the
/// framework requires values); <see cref="OpenShiftOAuthHandler"/> reads the real endpoints from
/// <c>IOAuthServerMetadataProvider</c> when it uses them (ADR-0018). Copying the discovered endpoints into the options
/// and evicting the options cache when they load (ADR-0010's first design) can't work for the first login after the host
/// came back: the authentication middleware initializes the OAuth handler (and so reads its options) at the start of
/// <em>every</em> request, before <c>GET /api/auth/login</c> awaits the metadata, so that request would still challenge
/// with the placeholders.</para>
/// <para><b>Configure, not post-configure:</b> the framework's <c>OAuthPostConfigureOptions</c> creates a default
/// backchannel when none is set. Running before it means our client is the only one ever created, while the framework
/// still adds its defaults (state data format, validation) afterwards.</para>
/// </remarks>
/// <param name="host">Client id/secret of the host OAuth client.</param>
/// <param name="httpClientFactory">Supplies the backchannel client.</param>
internal sealed class OpenShiftOAuthOptionsSetup(
    IOptions<OpenShiftHostOptions> host,
    IHttpClientFactory httpClientFactory) : IConfigureNamedOptions<OpenShiftOAuthOptions>
{
    /// <summary>Base of the placeholder endpoints (RFC 2606 <c>.invalid</c>: never resolves).</summary>
    public static readonly Uri UnavailableHost = new("https://oauth-metadata-unavailable.invalid/");

    /// <summary>Placeholder authorization endpoint, replaced by the discovered one at challenge time.</summary>
    public static readonly string PlaceholderAuthorizationEndpoint = new Uri(UnavailableHost, "oauth/authorize").AbsoluteUri;

    /// <summary>Placeholder token endpoint, replaced by the discovered one at code exchange.</summary>
    public static readonly string PlaceholderTokenEndpoint = new Uri(UnavailableHost, "oauth/token").AbsoluteUri;

    /// <inheritdoc />
    public void Configure(string? name, OpenShiftOAuthOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        if (!string.Equals(name, OpenShiftOAuthOptions.Scheme, StringComparison.Ordinal))
        {
            return;
        }

        // Validated on start (OpenShiftHostOptionsValidator): both are present.
        options.ClientId = host.Value.ClientId!;
        options.ClientSecret = host.Value.ClientSecret!;
        options.AuthorizationEndpoint = PlaceholderAuthorizationEndpoint;
        options.TokenEndpoint = PlaceholderTokenEndpoint;
        options.Backchannel = httpClientFactory.CreateClient(OpenShiftHostHttpClient.Name);
    }

    /// <inheritdoc />
    public void Configure(OpenShiftOAuthOptions options) => Configure(Options.DefaultName, options);
}
