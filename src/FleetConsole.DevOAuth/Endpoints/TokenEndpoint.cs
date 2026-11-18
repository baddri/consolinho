using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using FleetConsole.DevOAuth.Configuration;
using FleetConsole.DevOAuth.OAuth;
using Microsoft.Extensions.Options;

namespace FleetConsole.DevOAuth.Endpoints;

/// <summary>
/// <c>POST /oauth/token</c>: the back-channel leg where the Api exchanges the code for an access token
/// (RFC 6749 §4.1.3, RFC 7636 §4.5). Checks, in order: client authentication, grant type, code (exists, unused, not
/// expired, issued to this client), <c>redirect_uri</c> equality, PKCE.
/// </summary>
/// <remarks>
/// Error statuses follow contract §11 (400 with an OAuth error body), with one RFC 6749 §5.2 refinement: a client that
/// authenticated with HTTP Basic and failed gets 401 plus <c>WWW-Authenticate: Basic</c>. The Api's OAuth handler
/// sends credentials as form fields, so it sees 400.
/// </remarks>
internal static partial class TokenEndpoint
{
    private const string AuthorizationCodeGrantType = "authorization_code";

    /// <summary>Handles a token request.</summary>
    /// <param name="request">The current request (<c>application/x-www-form-urlencoded</c>).</param>
    /// <param name="options">Registered clients.</param>
    /// <param name="store">Redeems the code and issues the token.</param>
    /// <param name="loggerFactory">For the issued-token log line (never contains the token).</param>
    /// <returns>200 token response, or 400/401 OAuth error.</returns>
    public static async Task<IResult> HandleAsync(
        HttpRequest request,
        IOptions<DevOAuthOptions> options,
        DevOAuthStore store,
        ILoggerFactory loggerFactory)
    {
        if (!request.HasFormContentType)
        {
            return Error("invalid_request", "The token request must be application/x-www-form-urlencoded.");
        }

        var form = await request.ReadFormAsync(request.HttpContext.RequestAborted).ConfigureAwait(false);

        var clientError = AuthenticateClient(request, form, options.Value, out var client);
        if (clientError is not null)
        {
            return clientError;
        }

        var grantType = form["grant_type"].ToString();
        if (string.IsNullOrEmpty(grantType))
        {
            return Error("invalid_request", "grant_type is required.");
        }

        if (!string.Equals(grantType, AuthorizationCodeGrantType, StringComparison.Ordinal))
        {
            return Error("unsupported_grant_type", "Only the authorization_code grant is supported.");
        }

        var code = form["code"].ToString();
        if (string.IsNullOrEmpty(code))
        {
            return Error("invalid_request", "code is required.");
        }

        // From here on the code is consumed whatever the outcome (single use, RFC 6749 §4.1.2).
        var grant = store.RedeemCode(code);
        if (grant is null || !string.Equals(grant.ClientId, client!.ClientId, StringComparison.Ordinal))
        {
            return Error("invalid_grant", "The authorization code is invalid, expired, already used or was issued to another client.");
        }

        if (!string.Equals(form["redirect_uri"].ToString(), grant.RedirectUri, StringComparison.Ordinal))
        {
            return Error("invalid_grant", "redirect_uri does not match the authorization request.");
        }

        if (grant.CodeChallenge is not null)
        {
            var verifier = form["code_verifier"].ToString();
            if (!Pkce.IsWellFormed(verifier))
            {
                return Error("invalid_request", "code_verifier is required and must be 43-128 characters of [A-Za-z0-9-._~].");
            }

            if (!Pkce.Verify(grant.CodeChallenge, grant.CodeChallengeMethod!, verifier))
            {
                return Error("invalid_grant", "code_verifier does not match the code_challenge.");
            }
        }

        var accessToken = store.IssueAccessToken(grant.UserName);
        var logger = loggerFactory.CreateLogger(typeof(TokenEndpoint));
        LogTokenIssued(logger, grant.UserName, client.ClientId);

        return new NoStoreJsonResult(StatusCodes.Status200OK, new TokenResponse(
            AccessToken: accessToken,
            TokenType: "Bearer",
            ExpiresIn: (long)DevOAuthStore.TokenLifetime.TotalSeconds,
            Scope: grant.Scope));
    }

    /// <summary>
    /// RFC 6749 §2.3.1: HTTP Basic (id and secret form-URL-encoded, then base64) or <c>client_id</c> +
    /// <c>client_secret</c> form fields, but not both.
    /// </summary>
    /// <returns>Null with <paramref name="client"/> set when authenticated; otherwise the error response.</returns>
    private static NoStoreJsonResult? AuthenticateClient(HttpRequest request, IFormCollection form, DevOAuthOptions options, out DevOAuthClient? client)
    {
        client = null;
        string? clientId;
        string? clientSecret;
        var usedBasic = AuthenticationHeaderValue.TryParse(request.Headers.Authorization, out var header)
                        && string.Equals(header.Scheme, "Basic", StringComparison.OrdinalIgnoreCase);

        if (usedBasic)
        {
            if (form.ContainsKey("client_secret"))
            {
                return Error("invalid_request", "Use either HTTP Basic or client_secret in the body, not both.");
            }

            if (!TryDecodeBasic(header!.Parameter, out clientId, out clientSecret))
            {
                return ClientError(usedBasic);
            }
        }
        else
        {
            clientId = form["client_id"].ToString();
            clientSecret = form["client_secret"].ToString();
        }

        var match = options.Clients.FirstOrDefault(c => string.Equals(c.ClientId, clientId, StringComparison.Ordinal));
        if (match is null || string.IsNullOrEmpty(clientSecret)
            || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(match.ClientSecret), Encoding.UTF8.GetBytes(clientSecret)))
        {
            return ClientError(usedBasic);
        }

        client = match;
        return null;
    }

    private static bool TryDecodeBasic(string? parameter, out string? clientId, out string? clientSecret)
    {
        clientId = clientSecret = null;
        if (string.IsNullOrEmpty(parameter))
        {
            return false;
        }

        string decoded;
        try
        {
            decoded = Encoding.UTF8.GetString(Convert.FromBase64String(parameter));
        }
        catch (FormatException)
        {
            return false;
        }

        var separator = decoded.IndexOf(':', StringComparison.Ordinal);
        if (separator < 0)
        {
            return false;
        }

        clientId = Uri.UnescapeDataString(decoded[..separator].Replace('+', ' '));
        clientSecret = Uri.UnescapeDataString(decoded[(separator + 1)..].Replace('+', ' '));
        return true;
    }

    private static NoStoreJsonResult ClientError(bool usedBasic) =>
        usedBasic
            ? new NoStoreJsonResult(StatusCodes.Status401Unauthorized, new OAuthError("invalid_client", "Client authentication failed."), "Basic")
            : Error("invalid_client", "Client authentication failed.");

    private static NoStoreJsonResult Error(string error, string description) =>
        new(StatusCodes.Status400BadRequest, new OAuthError(error, description));

    [LoggerMessage(Level = LogLevel.Information, Message = "Issued an access token for user {UserName} to client {ClientId}")]
    private static partial void LogTokenIssued(ILogger logger, string userName, string clientId);

    /// <summary>Successful token response (RFC 6749 §5.1). OpenShift issues no refresh token.</summary>
    internal sealed record TokenResponse(
        [property: JsonPropertyName("access_token")] string AccessToken,
        [property: JsonPropertyName("token_type")] string TokenType,
        [property: JsonPropertyName("expires_in")] long ExpiresIn,
        [property: JsonPropertyName("scope")] string Scope);

    /// <summary>Error response (RFC 6749 §5.2).</summary>
    internal sealed record OAuthError(
        [property: JsonPropertyName("error")] string Error,
        [property: JsonPropertyName("error_description")] string ErrorDescription);

    /// <summary>JSON with the <c>Cache-Control: no-store</c> and <c>Pragma: no-cache</c> headers RFC 6749 §5.1 requires.</summary>
    private sealed class NoStoreJsonResult(int statusCode, object body, string? authenticateScheme = null) : IResult
    {
        public Task ExecuteAsync(HttpContext httpContext)
        {
            var headers = httpContext.Response.Headers;
            headers.CacheControl = "no-store";
            headers.Pragma = "no-cache";
            if (authenticateScheme is not null)
            {
                headers.WWWAuthenticate = authenticateScheme;
            }

            return Results.Json(body, statusCode: statusCode).ExecuteAsync(httpContext);
        }
    }
}
