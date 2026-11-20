using System.Text.Json.Serialization;
using FleetConsole.DevOAuth.OAuth;

namespace FleetConsole.DevOAuth.Endpoints;

/// <summary>
/// <c>GET /.well-known/oauth-authorization-server</c>: the OAuth 2.0 authorization server metadata (RFC 8414) that
/// OpenShift publishes and the Api reads to find the authorize and token endpoints (ADR-0010 "Discovery").
/// </summary>
internal static class DiscoveryEndpoint
{
    /// <summary>
    /// Returns the metadata with URLs built from the request's scheme and host. Browser and Api both reach the
    /// emulator directly (no proxy in between), so the request origin is the origin they must use.
    /// </summary>
    /// <param name="request">The current request.</param>
    /// <returns>200 with the metadata document; the field set and values mirror OpenShift's.</returns>
    public static IResult Handle(HttpRequest request)
    {
        var issuer = $"{request.Scheme}://{request.Host}";

        return TypedResults.Ok(new AuthorizationServerMetadata(
            Issuer: issuer,
            AuthorizationEndpoint: $"{issuer}/oauth/authorize",
            TokenEndpoint: $"{issuer}/oauth/token",
            ScopesSupported: AuthorizationRequest.SupportedScopes,
            ResponseTypesSupported: ["code", "token"],
            GrantTypesSupported: ["authorization_code", "implicit"],
            CodeChallengeMethodsSupported: [Pkce.Plain, Pkce.S256]));
    }

    /// <summary>The RFC 8414 document, with OpenShift's snake_case field names.</summary>
    internal sealed record AuthorizationServerMetadata(
        [property: JsonPropertyName("issuer")] string Issuer,
        [property: JsonPropertyName("authorization_endpoint")] string AuthorizationEndpoint,
        [property: JsonPropertyName("token_endpoint")] string TokenEndpoint,
        [property: JsonPropertyName("scopes_supported")] IReadOnlyList<string> ScopesSupported,
        [property: JsonPropertyName("response_types_supported")] IReadOnlyList<string> ResponseTypesSupported,
        [property: JsonPropertyName("grant_types_supported")] IReadOnlyList<string> GrantTypesSupported,
        [property: JsonPropertyName("code_challenge_methods_supported")] IReadOnlyList<string> CodeChallengeMethodsSupported);
}
