using System.Net;
using System.Text.Json;
using FleetConsole.Api.Auth;
using FleetConsole.Api.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;

namespace FleetConsole.Api.Tests.Integration.Proxy;

/// <summary>
/// A signed-in browser-like client for proxy tests whose requests reach the Api with <b>the request target exactly as
/// written</b>, like Kestrel delivers it.
/// </summary>
/// <remarks>
/// <para>The proxy forwards <c>IHttpRequestFeature.RawTarget</c> (ADR-0019 §2). Kestrel always sets it; TestServer
/// leaves it empty, and <see cref="Uri"/> canonicalizes paths (<c>%2e%2e</c> → <c>..</c> → removed). So requests are
/// built with <see cref="UriCreationOptions.DangerousDisablePathAndQueryCanonicalization"/>, an outer handler copies the
/// path and query into a test header (and hands TestServer the canonical URI, which it can parse), and the TestServer context hook moves it into <c>RawTarget</c> before the
/// pipeline runs — the production code path is unchanged.</para>
/// <para>Like <see cref="ApiFactory.CreateBrowserClient"/> it keeps cookies and sends <c>X-Console-Request: 1</c>.</para>
/// </remarks>
internal sealed class ProxyTestClient : IDisposable
{
    private const string RawTargetHeader = "X-Test-Raw-Target";
    private const string Origin = "http://localhost";
    private static readonly UriCreationOptions Raw = new() { DangerousDisablePathAndQueryCanonicalization = true };

    private ProxyTestClient(HttpClient http, CookieContainerHandler cookies)
    {
        Http = http;
        Cookies = cookies;
    }

    /// <summary>The underlying client (cookies + CSRF header + raw target).</summary>
    public HttpClient Http { get; }

    private CookieContainerHandler Cookies { get; }

    /// <summary>The session cookie header, for requests built outside <see cref="Http"/> (WebSocket client).</summary>
    public string CookieHeader => Cookies.Container.GetCookieHeader(new Uri("http://localhost"));

    /// <summary>Logs <paramref name="username"/> in through the real flow on <paramref name="factory"/>.</summary>
    /// <param name="factory">The Api host (default or a variant).</param>
    /// <param name="username">An emulator user.</param>
    /// <returns>The signed-in client.</returns>
    public static async Task<ProxyTestClient> LoginAsync(ApiFactory factory, string username)
    {
        var cookies = new CookieContainerHandler
        {
            InnerHandler = new RawTargetHandler { InnerHandler = factory.Server.CreateHandler(EmulateKestrelRawTarget) },
        };
        var http = new HttpClient(cookies) { BaseAddress = new Uri("http://localhost") };
        http.DefaultRequestHeaders.Add(CsrfHeaderMiddleware.HeaderName, CsrfHeaderMiddleware.HeaderValue);
        var client = new ProxyTestClient(http, cookies);

        using var final = await factory.RunLoginAsync(http, username);
        if (final.StatusCode != HttpStatusCode.Redirect || !client.CookieHeader.Contains(SessionDefaults.CookieName, StringComparison.Ordinal))
        {
            client.Dispose();
            throw new InvalidOperationException($"Login as {username} did not create a session: {(int)final.StatusCode}");
        }

        return client;
    }

    /// <summary>The absolute request URI for <paramref name="pathAndQuery"/>, not canonicalized.</summary>
    /// <param name="pathAndQuery">Path and query exactly as they should arrive, e.g. <c>/api/clusters/c/k8s/api/%2e%2e/x</c>.</param>
    /// <returns>The URI.</returns>
    public static Uri RawUri(string pathAndQuery) => new(Origin + pathAndQuery, Raw);

    /// <summary>Sends <paramref name="method"/> to <c>/api/clusters/{cluster}/k8s{k8sPathAndQuery}</c>.</summary>
    /// <param name="method">HTTP method.</param>
    /// <param name="cluster">The route cluster.</param>
    /// <param name="k8sPathAndQuery">The Kubernetes path and query, e.g. <c>/api/v1/namespaces</c>.</param>
    /// <param name="content">Optional body.</param>
    /// <param name="configure">Optional extra request setup (headers).</param>
    /// <param name="completion">When the returned task completes (headers only for streams).</param>
    /// <returns>The response.</returns>
    public Task<HttpResponseMessage> SendAsync(
        HttpMethod method,
        string cluster,
        string k8sPathAndQuery,
        HttpContent? content = null,
        Action<HttpRequestMessage>? configure = null,
        HttpCompletionOption completion = HttpCompletionOption.ResponseContentRead)
    {
        var request = new HttpRequestMessage(method, RawUri($"/api/clusters/{cluster}/k8s{k8sPathAndQuery}")) { Content = content };
        configure?.Invoke(request);
        return Http.SendAsync(request, completion, TestContext.Current.CancellationToken);
    }

    /// <summary>Reads a ProblemDetails body.</summary>
    /// <param name="response">The response.</param>
    /// <returns>The parsed body.</returns>
    public static async Task<JsonElement> ProblemAsync(HttpResponseMessage response)
    {
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)).RootElement.Clone();
    }

    /// <inheritdoc />
    public void Dispose() => Http.Dispose();

    // Runs inside TestServer before the request enters the pipeline.
    private static void EmulateKestrelRawTarget(HttpContext context)
    {
        if (context.Request.Headers.Remove(RawTargetHeader, out var raw))
        {
            context.Features.GetRequiredFeature<IHttpRequestFeature>().RawTarget = raw.ToString();
        }
    }

    private sealed class RawTargetHandler : DelegatingHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            // TestServer can't read a non-canonicalized Uri: pass the raw target in the header and give TestServer
            // the canonical form (it only drives routing, which still lands on the proxy endpoint).
            if (request.RequestUri is { IsAbsoluteUri: true } uri && uri.OriginalString.StartsWith(Origin, StringComparison.Ordinal))
            {
                request.Headers.TryAddWithoutValidation(RawTargetHeader, uri.OriginalString[Origin.Length..]);
                request.RequestUri = new Uri(uri.OriginalString);
            }

            return base.SendAsync(request, cancellationToken);
        }
    }
}
