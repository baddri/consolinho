using System.Net.Http.Headers;
using System.Text.Encodings.Web;
using System.Text.Json;
using FleetConsole.Api.Hosting;
using FleetConsole.Application.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OAuth;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Auth;

/// <summary>
/// ASP.NET Core's OAuth handler with three changes for FleetConsole (ADR-0010): the <c>redirect_uri</c> is built from
/// <c>Console:PublicOrigin</c> instead of the request, the OAuth endpoints come from
/// <see cref="IOAuthServerMetadataProvider"/> at the moment they are used, and token endpoint failures are classified
/// so the login ends on the right <c>/login?error=</c> page.
/// </summary>
/// <remarks>
/// <para><b>Why not override <c>BuildRedirectUri</c> (as ADR-0010 planned):</b> it is not virtual. The framework calls
/// it in exactly two places, both of which pass the result to a virtual method: <see cref="BuildChallengeUrl"/>
/// (authorize request) and <see cref="ExchangeCodeAsync"/> (token request). Both overrides replace the request-derived
/// value with <see cref="PublicRedirectUri"/>, so authorize and token requests always carry the same configured URI.</para>
/// <para><b>Endpoints:</b> the options carry placeholders (see <see cref="OpenShiftOAuthOptionsSetup"/> for why);
/// <see cref="BuildChallengeUrl"/> moves the query the base builds onto the discovered authorization endpoint, and
/// <see cref="ExchangeCodeAsync"/> posts to the discovered token endpoint.</para>
/// <para><b>Token request:</b> re-implemented rather than delegated to the base (ADR-0018), because the base neither
/// distinguishes network failures, 5xx and 429 (→ <see cref="OAuthServerUnavailableException"/>, "unavailable") from
/// rejected codes (→ "failed") nor survives a non-JSON or non-object body. It sends the same form as the base (client credentials in the body,
/// PKCE verifier), once: the backchannel has no retries because codes are single-use.</para>
/// </remarks>
internal sealed class OpenShiftOAuthHandler(
    IOptionsMonitor<OpenShiftOAuthOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IOptions<PublicOriginOptions> publicOrigin,
    IOAuthServerMetadataProvider metadataProvider)
    // The framework logs remote error text at Information; the handler only logs Warning and above (see the factory).
    : OAuthHandler<OpenShiftOAuthOptions>(options, new WarningOnlyLoggerFactory(logger), encoder)
{
    /// <summary>The callback URL registered with the OAuth server: <c>{Console:PublicOrigin}{CallbackPath}</c>.</summary>
    private string PublicRedirectUri => publicOrigin.Value.GetOrigin() + Options.CallbackPath;

    /// <inheritdoc />
    protected override string BuildChallengeUrl(AuthenticationProperties properties, string redirectUri)
    {
        // The only challenger is GET /api/auth/login, which awaits the metadata first and never challenges without it.
        var metadata = metadataProvider.Current
            ?? throw new InvalidOperationException("The OpenShift login was challenged before the OAuth server metadata was loaded.");

        // The base adds client_id, scope, response_type, redirect_uri, PKCE and the protected state to the placeholder
        // endpoint; re-attach exactly those parameters to the real endpoint.
        var placeholderUrl = base.BuildChallengeUrl(properties, PublicRedirectUri);
        var parameters = QueryHelpers.ParseQuery(new Uri(placeholderUrl).Query);
        return QueryHelpers.AddQueryString(metadata.AuthorizationEndpoint.AbsoluteUri, parameters);
    }

    /// <inheritdoc />
    protected override async Task<OAuthTokenResponse> ExchangeCodeAsync(OAuthCodeExchangeContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        // From here on the framework may report failures without the state's properties (exceptions); keep the return
        // URL so the failure redirect can still send the user back where they wanted to go.
        OpenShiftLoginEvents.RememberReturnUrl(Context, context.Properties);

        var parameters = new Dictionary<string, string>
        {
            ["client_id"] = Options.ClientId,
            ["redirect_uri"] = PublicRedirectUri,
            ["client_secret"] = Options.ClientSecret,
            ["code"] = context.Code,
            ["grant_type"] = "authorization_code",
        };

        // PKCE: the verifier was stored in the (encrypted) state by BuildChallengeUrl. Remove it so it can't end up in
        // the session ticket, as the base implementation does.
        if (context.Properties.Items.TryGetValue(OAuthConstants.CodeVerifierKey, out var codeVerifier) && codeVerifier is not null)
        {
            parameters[OAuthConstants.CodeVerifierKey] = codeVerifier;
            context.Properties.Items.Remove(OAuthConstants.CodeVerifierKey);
        }

        // Loaded before the challenge, so normally cached; null only if the process restarted with the host down.
        var metadata = await metadataProvider.GetAsync(Context.RequestAborted).ConfigureAwait(false)
            ?? throw new OAuthServerUnavailableException("The host OAuth server metadata is unavailable.");

        using var request = new HttpRequestMessage(HttpMethod.Post, metadata.TokenEndpoint);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Content = new FormUrlEncodedContent(parameters);
        request.Version = Backchannel.DefaultRequestVersion;

        HttpResponseMessage response;
        try
        {
            // Default completion: the small body is read inside SendAsync, so the client timeout covers it.
            response = await Backchannel.SendAsync(request, Context.RequestAborted).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is HttpRequestException
                                              || (exception is TaskCanceledException && !Context.RequestAborted.IsCancellationRequested))
        {
            throw new OAuthServerUnavailableException(
                $"The host OAuth token endpoint could not be reached ({exception.GetType().Name}).", exception);
        }

        using (response)
        {
            var status = (int)response.StatusCode;

            // 5xx and 429 (rate limited) are the server's condition, not a rejected code: "unavailable" tells the user
            // to try again later. (A retry here is impossible anyway: the code may already be consumed.)
            if (status >= 500 || response.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
            {
                return OAuthTokenResponse.Failed(new OAuthServerUnavailableException(
                    $"The host OAuth token endpoint answered HTTP {status}."));
            }

            if (!response.IsSuccessStatusCode)
            {
                // invalid_grant (expired/used code, PKCE or redirect mismatch), invalid_client (configuration): "failed".
                // The body is not included: it is the server's text, not ours to log.
                return OAuthTokenResponse.Failed(new AuthenticationFailureException(
                    $"The host OAuth token endpoint rejected the authorization code (HTTP {status})."));
            }

            var body = await response.Content.ReadAsStringAsync(Context.RequestAborted).ConfigureAwait(false);
            JsonDocument document;
            try
            {
                document = JsonDocument.Parse(body);
            }
            catch (JsonException)
            {
                return OAuthTokenResponse.Failed(new AuthenticationFailureException(
                    "The host OAuth token endpoint answered with a body that is not JSON."));
            }

            // OAuthTokenResponse's constructor throws for anything but an object ([] or "x"); fail deliberately instead.
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                document.Dispose();
                return OAuthTokenResponse.Failed(new AuthenticationFailureException(
                    "The host OAuth token endpoint answered with JSON that is not an object."));
            }

            // OAuthTokenResponse takes ownership of the document and disposes it with the response.
            return OAuthTokenResponse.Success(document);
        }
    }
}
