namespace FleetConsole.DevOAuth.Endpoints;

/// <summary>
/// Maps the emulator's HTTP surface (docs/specs/CP1-api-contract.md §11). Paths are exactly OpenShift's so the Api
/// discovers and calls the emulator with the same code it uses against a real host cluster; only
/// <c>Auth:OpenShift:HostApiServerUrl</c> differs.
/// </summary>
/// <remarks>
/// On OpenShift the discovery document and <c>users/~</c> are served by the API server and the authorize/token
/// endpoints by the separate <c>oauth-openshift</c> route; the emulator serves all of them from one origin, which the
/// Api cannot tell apart because it follows the URLs in the discovery document.
/// </remarks>
internal static class DevOAuthEndpoints
{
    /// <summary>Maps discovery, authorize (GET + POST), token, <c>users/~</c> and the <c>groups</c> list (ADR-0039).</summary>
    /// <param name="app">The route builder (the application).</param>
    /// <returns>The same route builder, for chaining.</returns>
    public static IEndpointRouteBuilder MapDevOAuthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/.well-known/oauth-authorization-server", DiscoveryEndpoint.Handle);
        app.MapGet("/oauth/authorize", AuthorizeEndpoints.HandleGet);
        app.MapPost("/oauth/authorize", AuthorizeEndpoints.HandlePostAsync);
        app.MapPost("/oauth/token", TokenEndpoint.HandleAsync);
        app.MapGet("/apis/user.openshift.io/v1/users/~", CurrentUserEndpoint.Handle);
        app.MapGet("/apis/user.openshift.io/v1/groups", GroupsEndpoint.Handle);
        return app;
    }
}
