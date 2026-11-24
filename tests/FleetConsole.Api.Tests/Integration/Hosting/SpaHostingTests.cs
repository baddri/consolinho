using System.Net;
using FleetConsole.Api.Http;

namespace FleetConsole.Api.Tests.Integration.Hosting;

/// <summary>
/// HOST-1/HOST-2 (ADR-0028 §1): the Production host serves the built SPA, answers deep links with <c>index.html</c>,
/// keeps unknown <c>/api</c> paths as ProblemDetails 404 and sets the SPA cache headers.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class SpaHostingTests(ApiFactory factory)
{
    private const string NoCache = "no-cache";
    private const string Immutable = "public, max-age=31536000, immutable";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("/")]
    [InlineData("/c/x/k8s/ns/a/pods/b")]
    [InlineData("/apix/deep")]
    public async Task Get_SpaRoute_ReturnsIndexHtml_NotCached(string path)
    {
        await using var host = ProductionHost.Create(factory);
        using var client = host.CreateClient();

        using var response = await client.GetAsync(new Uri(path, UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("text/html");
        response.Headers.CacheControl?.ToString().ShouldBe(NoCache);
        (await response.Content.ReadAsStringAsync(Ct)).ShouldBe(ProductionHost.IndexHtml);
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/c/x/k8s/ns/a/pods/b")]
    public async Task Head_SpaRoute_ReturnsIndexHtmlHeaders(string path)
    {
        await using var host = ProductionHost.Create(factory);
        using var client = host.CreateClient();

        using var request = new HttpRequestMessage(HttpMethod.Head, new Uri(path, UriKind.Relative));
        using var response = await client.SendAsync(request, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("text/html");
        response.Headers.CacheControl?.ToString().ShouldBe(NoCache);
    }

    [Fact]
    public async Task Get_IndexHtmlDirectly_IsNotCached()
    {
        await using var host = ProductionHost.Create(factory);
        using var client = host.CreateClient();

        using var response = await client.GetAsync(new Uri("/index.html", UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Headers.CacheControl?.ToString().ShouldBe(NoCache);
    }

    [Fact]
    public async Task Get_HashedAsset_IsImmutable()
    {
        await using var host = ProductionHost.Create(factory);
        using var client = host.CreateClient();

        using var response = await client.GetAsync(new Uri(ProductionHost.AssetPath, UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Headers.CacheControl?.ToString().ShouldBe(Immutable);
    }

    [Fact]
    public async Task Get_MissingAsset_Returns404()
    {
        await using var host = ProductionHost.Create(factory);
        using var client = host.CreateClient();

        using var response = await client.GetAsync(new Uri("/assets/missing.js", UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
        response.Content.Headers.ContentType?.MediaType.ShouldNotBe("text/html");
    }

    [Theory]
    [InlineData("GET", "/api/nope")]
    [InlineData("GET", "/API/nope")]
    [InlineData("GET", "/api")]
    [InlineData("POST", "/api/nope")]
    public async Task UnknownApiPath_Returns404ProblemDetails_NeverIndexHtml(string method, string path)
    {
        await using var host = ProductionHost.Create(factory);
        using var client = host.CreateClient();
        client.DefaultRequestHeaders.Add(CsrfHeaderMiddleware.HeaderName, CsrfHeaderMiddleware.HeaderValue);

        using var request = new HttpRequestMessage(new HttpMethod(method), new Uri(path, UriKind.Relative));
        using var response = await client.SendAsync(request, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
    }

    [Theory]
    [InlineData("POST")]
    [InlineData("DELETE")]
    public async Task NonGetToSpaRoute_Returns404_NeverIndexHtml(string method)
    {
        await using var host = ProductionHost.Create(factory);
        using var client = host.CreateClient();

        using var request = new HttpRequestMessage(new HttpMethod(method), new Uri("/c/x/k8s/ns/a/pods/b", UriKind.Relative));
        using var response = await client.SendAsync(request, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
        response.Content.Headers.ContentType?.MediaType.ShouldNotBe("text/html");
    }

    [Theory]
    [InlineData("/health")]
    [InlineData("/alive")]
    public async Task Probes_AreNeverAnsweredByTheFallback(string path)
    {
        await using var host = ProductionHost.Create(factory);
        using var client = host.CreateClient();

        using var response = await Readiness.GetWhenReadyAsync(client, path, Ct);

        response.Content.Headers.ContentType?.MediaType.ShouldNotBe("text/html");
        (await response.Content.ReadAsStringAsync(Ct)).ShouldBe("Healthy");
    }
}
