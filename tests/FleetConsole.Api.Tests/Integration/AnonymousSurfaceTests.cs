using FleetConsole.Api.Auth;
using FleetConsole.Api.Tests.Integration.Hosting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// QA R3 / ADR-0012: the only <c>/api</c> endpoints reachable without a session are ADR-0012's list. Enumerates every
/// mapped endpoint, so a new endpoint can't become anonymous by accident (e.g. by being mapped outside the
/// <c>/api</c> group or with a stray <c>.AllowAnonymous()</c>). Outside <c>/api</c>, a Production host maps only
/// ADR-0028's probes and SPA fallback.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class AnonymousSurfaceTests(ApiFactory factory)
{
    /// <summary>
    /// ADR-0012's complete anonymous surface. <c>Mapped: false</c> would mark an entry whose endpoint doesn't exist yet
    /// (none since T-0015). <c>GET /api/auth/callback</c> is not listed: it is handled by the OAuth middleware, not a
    /// mapped endpoint.
    /// </summary>
    private static readonly (string Endpoint, bool Mapped)[] Adr0012AnonymousEndpoints =
    [
        ("GET /api/auth/login", true),
        ("POST /api/auth/logout", true),
        ("GET /api/system/info", true),
    ];

    /// <summary>
    /// ADR-0028 §1/§2: the only endpoints outside <c>/api</c> in Production, all anonymous by design — the kubelet probes
    /// (any method, default writer: status word only) and the SPA fallback to <c>index.html</c> (no file extension; its route
    /// constraint admits only GET/HEAD outside <c>/api</c>). Development additionally maps <c>/openapi/{documentName}.json</c>.
    /// </summary>
    private static readonly string[] Adr0028NonApiEndpoints =
    [
        "* /alive",
        "* /health",
        "* {*path:nonfile:sparequest}",
    ];

    [Fact]
    public void OnlyAdr0012EndpointsAllowAnonymousAccess()
    {
        var anonymous = ApiEndpoints()
            .Where(e => e.Metadata.GetMetadata<IAllowAnonymous>() is not null || e.Metadata.GetOrderedMetadata<IAuthorizeData>().Count == 0)
            .SelectMany(Describe)
            .Order(StringComparer.Ordinal)
            .ToArray();

        anonymous.ShouldBe(Adr0012AnonymousEndpoints.Where(e => e.Mapped).Select(e => e.Endpoint).Order(StringComparer.Ordinal).ToArray());
    }

    [Fact]
    public async Task OutsideApi_ProductionMapsOnlyTheAdr0028AnonymousEndpoints()
    {
        await using var host = ProductionHost.Create(factory);

        var endpoints = host.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(e => !IsApi(e))
            .ToArray();

        endpoints.SelectMany(Describe).Order(StringComparer.Ordinal).ToArray()
            .ShouldBe(Adr0028NonApiEndpoints.Order(StringComparer.Ordinal).ToArray());
        endpoints.Where(e => e.Metadata.GetMetadata<IAllowAnonymous>() is null && e.Metadata.GetOrderedMetadata<IAuthorizeData>().Count > 0)
            .SelectMany(Describe)
            .ShouldBeEmpty();
    }

    [Fact]
    public void AdminEndpoints_RequireTheAdminPolicy()
    {
        var withoutAdminPolicy = ApiEndpoints()
            .Where(e => e.RoutePattern.RawText!.StartsWith("/api/admin", StringComparison.OrdinalIgnoreCase))
            .Where(e => !e.Metadata.GetOrderedMetadata<IAuthorizeData>().Any(a => a.Policy == AuthorizationPolicies.Admin)
                        || e.Metadata.GetMetadata<IAllowAnonymous>() is not null)
            .SelectMany(Describe)
            .ToArray();

        withoutAdminPolicy.ShouldBeEmpty();
    }

    [Fact]
    public void EndpointEnumeration_SeesTheApi()
    {
        // Guards the two tests above against passing vacuously (e.g. if the data source were empty).
        ApiEndpoints().SelectMany(Describe).ShouldContain("GET /api/system/info");
    }

    private RouteEndpoint[] ApiEndpoints() =>
        factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(IsApi)
            .ToArray();

    private static bool IsApi(RouteEndpoint endpoint) =>
        endpoint.RoutePattern.RawText is { } pattern
        && (pattern.Equals("/api", StringComparison.OrdinalIgnoreCase)
            || pattern.StartsWith("/api/", StringComparison.OrdinalIgnoreCase));

    private static IEnumerable<string> Describe(RouteEndpoint endpoint)
    {
        // No method metadata, or metadata without methods (the SPA fallback), means any method.
        var methods = endpoint.Metadata.GetMetadata<IHttpMethodMetadata>()?.HttpMethods is { Count: > 0 } list ? list : ["*"];
        return methods.Select(method => $"{method} {endpoint.RoutePattern.RawText}");
    }
}
