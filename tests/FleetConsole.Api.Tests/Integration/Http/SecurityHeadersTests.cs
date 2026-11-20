using System.Net;
using FleetConsole.Api.Http;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Api.Tests.Integration.Hosting;
using FleetConsole.Api.Tests.Integration.Proxy;
using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Access;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Integration.Http;

/// <summary>
/// ADR-0029 / HOST-3 / T-0092: the five security headers, with the CSP byte-for-byte equal to the contract, on every
/// kind of response — SPA document (direct and fallback), hashed asset, API JSON, 403 CSRF problem, 500 problem, probe
/// and a proxied Kubernetes response whose upstream sent its own values (ours win).
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class SecurityHeadersTests(ApiFactory factory)
{
    // Copied from ADR-0029 on purpose (not the middleware constant): the test pins the contract, not the code.
    private const string ContractCsp =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public void Middleware_Csp_Equals_The_Adr_Contract() =>
        SecurityHeadersMiddleware.ContentSecurityPolicy.ShouldBe(ContractCsp);

    [Theory]
    [InlineData("/")]
    [InlineData("/index.html")]
    [InlineData("/c/x/k8s/ns/a/pods/b")]
    [InlineData(ProductionHost.AssetPath)]
    [InlineData("/api/system/info")]
    [InlineData("/alive")]
    public async Task Production_Get_CarriesAllHeaders(string path)
    {
        await using var host = ProductionHost.Create(factory);
        using var client = host.CreateClient();

        using var response = await client.GetAsync(new Uri(path, UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        ShouldCarrySecurityHeaders(response);
    }

    [Fact]
    public async Task CsrfRejection_403Problem_CarriesAllHeaders()
    {
        await using var host = ProductionHost.Create(factory);
        using var client = host.CreateClient();

        using var response = await client.PostAsync(new Uri("/api/system/info", UriKind.Relative), content: null, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
        ShouldCarrySecurityHeaders(response);
    }

    [Fact]
    public async Task UnhandledException_500Problem_CarriesAllHeaders()
    {
        // The exception handler clears the response headers before writing the problem; OnStarting re-applies ours.
        await using var host = ProductionHost.Create(factory);
        await using var throwing = host.Factory.WithWebHostBuilder(builder =>
            builder.ConfigureTestServices(services => services.AddSingleton<IAppEnvironment, ThrowingAppEnvironment>()));
        using var client = throwing.CreateClient();

        using var response = await client.GetAsync(new Uri("/api/system/info", UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.InternalServerError);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
        ShouldCarrySecurityHeaders(response);
    }

    [Fact]
    public async Task ProxiedKubernetesResponse_UpstreamSecurityHeaders_AreOverwritten()
    {
        const string pods = "/api/v1/namespaces/shop/pods";
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Map("GET", pods, async context =>
        {
            // An upstream trying to set weaker policies must not reach the browser.
            context.Response.Headers["Content-Security-Policy"] = "default-src *";
            context.Response.Headers["X-Frame-Options"] = "SAMEORIGIN";
            context.Response.Headers["Referrer-Policy"] = "unsafe-url";
            context.Response.Headers["Cross-Origin-Opener-Policy"] = "unsafe-none";
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync("""{"kind":"PodList","items":[]}""", Ct);
        });
        var username = factory.NewUsername();
        var (cluster, _) = await factory.Data.ProxyClusterAsync(server, username, AccessMode.ReadOnly);
        using var client = await ProxyTestClient.LoginAsync(factory, username);

        using var response = await client.SendAsync(HttpMethod.Get, cluster.Name, pods);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        ShouldCarrySecurityHeaders(response);
    }

    // Exactly one value per header (no upstream duplicate appended next to ours), equal to the contract.
    private static void ShouldCarrySecurityHeaders(HttpResponseMessage response)
    {
        Single(response, "Content-Security-Policy").ShouldBe(ContractCsp);
        Single(response, "X-Content-Type-Options").ShouldBe("nosniff");
        Single(response, "Referrer-Policy").ShouldBe("no-referrer");
        Single(response, "X-Frame-Options").ShouldBe("DENY");
        Single(response, "Cross-Origin-Opener-Policy").ShouldBe("same-origin");
    }

    private static string Single(HttpResponseMessage response, string name)
    {
        response.Headers.NonValidated.TryGetValues(name, out var values).ShouldBeTrue($"missing header {name}");
        return values.ShouldHaveSingleItem();
    }

    private sealed class ThrowingAppEnvironment : IAppEnvironment
    {
        public string Version => throw new InvalidOperationException("boom");

        public string EnvironmentName => "unused";
    }
}
