using FleetConsole.Api.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// QA R3 / ADR-0012: the only <c>/api</c> endpoints reachable without a session are ADR-0012's list. Enumerates every
/// mapped endpoint, so a new endpoint can't become anonymous by accident (e.g. by being mapped outside the
/// <c>/api</c> group or with a stray <c>.AllowAnonymous()</c>).
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class AnonymousSurfaceTests(ApiFactory factory)
{
    /// <summary>
    /// ADR-0012's complete anonymous surface. <c>Mapped: false</c> entries don't exist yet; the task that adds the
    /// endpoint flips the flag (T-0015 for the auth endpoints). <c>GET /api/auth/callback</c> is not listed: it is
    /// handled by the OAuth middleware, not a mapped endpoint.
    /// </summary>
    private static readonly (string Endpoint, bool Mapped)[] Adr0012AnonymousEndpoints =
    [
        ("GET /api/auth/login", false),
        ("POST /api/auth/logout", false),
        ("GET /api/system/info", true),
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
            .Where(e => e.RoutePattern.RawText is { } pattern
                        && (pattern.Equals("/api", StringComparison.OrdinalIgnoreCase)
                            || pattern.StartsWith("/api/", StringComparison.OrdinalIgnoreCase)))
            .ToArray();

    private static IEnumerable<string> Describe(RouteEndpoint endpoint)
    {
        var methods = endpoint.Metadata.GetMetadata<IHttpMethodMetadata>()?.HttpMethods ?? ["*"];
        return methods.Select(method => $"{method} {endpoint.RoutePattern.RawText}");
    }
}
