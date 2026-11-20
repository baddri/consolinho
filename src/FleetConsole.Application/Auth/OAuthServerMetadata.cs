namespace FleetConsole.Application.Auth;

/// <summary>
/// The two endpoints of the host cluster's OAuth server that the login flow needs, from RFC 8414 discovery
/// (<c>/.well-known/oauth-authorization-server</c>) or from static configuration (ADR-0010).
/// </summary>
/// <param name="AuthorizationEndpoint">Where the browser is sent to log in (absolute http(s) URL).</param>
/// <param name="TokenEndpoint">Where the Api redeems the authorization code (absolute http(s) URL).</param>
public sealed record OAuthServerMetadata(Uri AuthorizationEndpoint, Uri TokenEndpoint);
