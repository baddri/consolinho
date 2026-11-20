using System.Diagnostics.CodeAnalysis;
using FleetConsole.DevOAuth.Configuration;
using Microsoft.Extensions.Primitives;

namespace FleetConsole.DevOAuth.OAuth;

/// <summary>
/// A validated OAuth 2.0 authorization request (RFC 6749 §4.1.1 + RFC 7636 §4.3), as sent by the Api's OAuth handler
/// to <c>GET /oauth/authorize</c> and echoed back by the user picker's forms to <c>POST /oauth/authorize</c>.
/// </summary>
/// <remarks>
/// <para>Both legs parse with <see cref="TryParse"/>: the POST comes from a browser form and is no more trusted than
/// the query string.</para>
/// <para>Deliberate simplifications versus OpenShift: any absolute http(s) <c>redirect_uri</c> without a fragment is
/// accepted, because the dev Api's redirect URI is the Vite origin whose port Aspire assigns per run (OpenShift checks
/// it against the OAuth client's registered URIs). Every invalid request gets the 400 error page instead of an error
/// redirect (contract §11).</para>
/// </remarks>
/// <param name="Client">The registered client identified by <c>client_id</c>.</param>
/// <param name="RedirectUri">Where the browser is sent back with the code or error.</param>
/// <param name="Scope">Space-separated scopes, each one of <see cref="SupportedScopes"/>.</param>
/// <param name="State">Opaque client state, returned unchanged; null when absent.</param>
/// <param name="CodeChallenge">PKCE challenge, or null when the client does not use PKCE.</param>
/// <param name="CodeChallengeMethod">PKCE method (defaults to <c>plain</c> when a challenge has no method), or null.</param>
internal sealed record AuthorizationRequest(
    DevOAuthClient Client,
    string RedirectUri,
    string Scope,
    string? State,
    string? CodeChallenge,
    string? CodeChallengeMethod)
{
    /// <summary>Scopes advertised in the discovery document and accepted on authorize requests.</summary>
    public static readonly IReadOnlyList<string> SupportedScopes = ["user:info", "user:check-access", "user:full"];

    /// <summary>The only <c>response_type</c> the emulator implements (the discovery document also lists <c>token</c>).</summary>
    public const string CodeResponseType = "code";

    /// <summary>
    /// The request as name/value pairs, for the hidden inputs of the picker's forms. Absent optional values are left
    /// out so the POST parses to the same request.
    /// </summary>
    /// <returns>Parameter names and values in protocol order.</returns>
    public IEnumerable<KeyValuePair<string, string>> ToParameters()
    {
        yield return new("client_id", Client.ClientId);
        yield return new("redirect_uri", RedirectUri);
        yield return new("response_type", CodeResponseType);
        yield return new("scope", Scope);

        if (State is not null)
        {
            yield return new("state", State);
        }

        if (CodeChallenge is not null)
        {
            yield return new("code_challenge", CodeChallenge);
            yield return new("code_challenge_method", CodeChallengeMethod!);
        }
    }

    /// <summary>Parses and validates the authorize parameters against the configured clients.</summary>
    /// <param name="parameters">Reads one parameter (query string or form); a repeated parameter is an error.</param>
    /// <param name="options">The emulator configuration (registered clients).</param>
    /// <param name="request">The validated request when the method returns true.</param>
    /// <param name="error">A human-readable reason for the 400 page when the method returns false.</param>
    /// <returns>True when the request is valid.</returns>
    public static bool TryParse(
        Func<string, StringValues> parameters,
        DevOAuthOptions options,
        [NotNullWhen(true)] out AuthorizationRequest? request,
        [NotNullWhen(false)] out string? error)
    {
        request = null;

        // RFC 6749 §3.1: parameters must not be included more than once.
        string? Single(string name, ref string? firstError)
        {
            var values = parameters(name);
            if (values.Count > 1)
            {
                firstError ??= $"Parameter '{name}' must not be repeated.";
                return null;
            }

            return string.IsNullOrEmpty(values) ? null : values.ToString();
        }

        error = null;
        var clientId = Single("client_id", ref error);
        var redirectUri = Single("redirect_uri", ref error);
        var responseType = Single("response_type", ref error);
        var scope = Single("scope", ref error);
        var state = Single("state", ref error);
        var codeChallenge = Single("code_challenge", ref error);
        var codeChallengeMethod = Single("code_challenge_method", ref error);
        if (error is not null)
        {
            return false;
        }

        var client = options.Clients.FirstOrDefault(c => string.Equals(c.ClientId, clientId, StringComparison.Ordinal));
        error = Validate(client, redirectUri, responseType, scope, codeChallenge, ref codeChallengeMethod);
        if (error is not null)
        {
            return false;
        }

        request = new AuthorizationRequest(client!, redirectUri!, scope!, state, codeChallenge, codeChallengeMethod);
        return true;
    }

    /// <summary>Checks the parsed values in protocol order; returns the first problem, or null when valid.</summary>
    private static string? Validate(
        DevOAuthClient? client,
        string? redirectUri,
        string? responseType,
        string? scope,
        string? codeChallenge,
        ref string? codeChallengeMethod)
    {
        if (client is null)
        {
            return "Unknown or missing client_id.";
        }

        if (!IsValidRedirectUri(redirectUri))
        {
            return "redirect_uri must be an absolute http(s) URL without a fragment.";
        }

        if (!string.Equals(responseType, CodeResponseType, StringComparison.Ordinal))
        {
            return "Unsupported response_type; the emulator implements the authorization code flow (response_type=code).";
        }

        if (!IsValidScope(scope))
        {
            return $"scope is required and may only contain: {string.Join(", ", SupportedScopes)}.";
        }

        return ValidatePkce(codeChallenge, ref codeChallengeMethod);
    }

    private static bool IsValidRedirectUri(string? value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
        && string.IsNullOrEmpty(uri.Fragment);

    private static bool IsValidScope(string? scope)
    {
        var scopes = scope?.Split(' ', StringSplitOptions.RemoveEmptyEntries) ?? [];
        return scopes.Length > 0 && scopes.All(s => SupportedScopes.Contains(s, StringComparer.Ordinal));
    }

    /// <summary>RFC 7636 §4.3/§4.4: method only together with a challenge; default <c>plain</c>; well-formed challenge.</summary>
    private static string? ValidatePkce(string? challenge, ref string? method)
    {
        if (challenge is null)
        {
            return method is null ? null : "code_challenge_method was sent without a code_challenge.";
        }

        method ??= Pkce.Plain;
        if (!Pkce.IsSupportedMethod(method))
        {
            return $"Unsupported code_challenge_method '{method}'; use {Pkce.S256} or {Pkce.Plain}.";
        }

        return Pkce.IsWellFormed(challenge) ? null : "code_challenge must be 43-128 characters of [A-Za-z0-9-._~].";
    }
}
