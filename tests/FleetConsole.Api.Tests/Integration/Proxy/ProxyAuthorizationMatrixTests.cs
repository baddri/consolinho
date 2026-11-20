using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using FleetConsole.Api.Http;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Domain.Access;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Integration.Proxy;

/// <summary>
/// QA sweep SEC-5 (CP1 D3/R4 carry-over): every principal kind × a read (GET) and a mutation (PUT) on every Kubernetes
/// proxy route, with the status and problem <c>code</c> of CP2 contract §4. The route list is checked against the
/// routing data source, so a new <c>/k8s/</c> route that the matrix doesn't know fails the enumeration test.
/// </summary>
/// <remarks>
/// Runs on a variant with <c>Auth:RevalidationInterval=0</c> so a deactivation takes effect on the very next request
/// (production: within the interval). A 200 is the fake API server's answer; denials must not reach it.
/// </remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProxyAuthorizationMatrixTests(ProxyAuthorizationMatrixTests.Host fixture) : IClassFixture<ProxyAuthorizationMatrixTests.Host>
{
    /// <summary>The Kubernetes proxy route patterns this matrix covers (any method).</summary>
    private static readonly string[] MatrixRoutes = ["/api/clusters/{cluster}/k8s/{**path}"];

    private const string ConfigMap = "/api/v1/namespaces/shop/configmaps/web";

    private readonly ApiFactory _host = fixture.Api;
    private readonly FakeKubeApiServer _server = fixture.Server;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>The principal kinds of the matrix.</summary>
    public enum Principal
    {
        /// <summary>No session.</summary>
        Anonymous,

        /// <summary>Signed in with a ReadWrite grant, then deactivated.</summary>
        Deactivated,

        /// <summary>Signed in, cluster exists, no grant.</summary>
        NoGrant,

        /// <summary>A configuration admin without a grant (admin is not a cluster permission).</summary>
        AdminWithoutGrant,

        /// <summary>A ReadWrite grant on a disabled cluster.</summary>
        DisabledCluster,

        /// <summary>A ReadOnly grant.</summary>
        ReadOnlyGrant,

        /// <summary>A globally read-only user with a ReadWrite grant.</summary>
        ReadOnlyUser,

        /// <summary>A ReadWrite grant.</summary>
        ReadWrite,

        /// <summary>A ReadWrite grant, requests without <c>X-Console-Request</c>.</summary>
        NoCsrfHeader,
    }

    /// <summary>Expected (status, code) per principal for GET and PUT; a null code means the upstream body.</summary>
    public static TheoryData<Principal, int, string?, int, string?> Matrix() => new()
    {
        { Principal.Anonymous, 401, "Auth.Unauthenticated", 401, "Auth.Unauthenticated" },
        { Principal.Deactivated, 401, "Auth.Unauthenticated", 401, "Auth.Unauthenticated" },
        { Principal.NoGrant, 404, "Proxy.NotAvailable", 404, "Proxy.NotAvailable" },
        { Principal.AdminWithoutGrant, 404, "Proxy.NotAvailable", 404, "Proxy.NotAvailable" },
        { Principal.DisabledCluster, 404, "Proxy.NotAvailable", 404, "Proxy.NotAvailable" },
        { Principal.ReadOnlyGrant, 200, null, 403, "Proxy.ReadOnlyGrant" },
        { Principal.ReadOnlyUser, 200, null, 403, "Proxy.UserReadOnly" },
        { Principal.ReadWrite, 200, null, 200, null },
        { Principal.NoCsrfHeader, 200, null, 403, "Auth.CsrfHeaderMissing" },
    };


    [Fact]
    public void EveryKubernetesProxyRoute_IsInTheMatrix()
    {
        var routes = _host.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(e => e.RoutePattern.RawText is { } p && p.Contains("/k8s/", StringComparison.OrdinalIgnoreCase))
            .ToArray();

        routes.ShouldNotBeEmpty("the enumeration must see the proxy route, or the matrix passes vacuously");
        routes.Select(e => e.RoutePattern.RawText!).ShouldAllBe(p => MatrixRoutes.Contains(p));
        // The matrix sends GET and PUT: that is only representative if the route takes every method (no method filter).
        routes.ShouldAllBe(e => e.Metadata.GetMetadata<IHttpMethodMetadata>() == null);
    }

    [Theory]
    [MemberData(nameof(Matrix))]
    public async Task Get_And_Put_Give_The_Contract_Outcome(Principal principal, int getStatus, string? getCode, int putStatus, string? putCode)
    {
        var (client, cluster) = await ArrangeAsync(principal);
        using var _ = client;
        var failures = new List<string>();

        foreach (var route in MatrixRoutes)
        {
            var path = Fill(route, cluster);
            await ExpectAsync(client, HttpMethod.Get, path, getStatus, getCode, failures);
            await ExpectAsync(client, HttpMethod.Put, path, putStatus, putCode, failures);
        }

        failures.ShouldBeEmpty();
    }

    private async Task<(ProxyTestClient Client, string Cluster)> ArrangeAsync(Principal principal)
    {
        var data = _host.Data;
        switch (principal)
        {
            case Principal.Anonymous:
            {
                var username = _host.NewUsername();
                var (cluster, _) = await data.ProxyClusterAsync(_server, username, AccessMode.ReadWrite);
                return (ProxyTestClient.Anonymous(_host), cluster.Name);
            }

            case Principal.Deactivated:
            {
                var username = _host.NewUsername();
                var (cluster, _) = await data.ProxyClusterAsync(_server, username, AccessMode.ReadWrite);
                var client = await ProxyTestClient.LoginAsync(_host, username);
                await data.DeactivateAsync(username);
                return (client, cluster.Name);
            }

            case Principal.NoGrant:
            case Principal.AdminWithoutGrant:
            {
                var cluster = await data.ClusterAsync(apiUrl: _server.BaseAddress.ToString(), caBundlePem: _server.CaBundlePem);
                await data.CredentialAsync(cluster.Name);
                var username = principal == Principal.NoGrant ? _host.NewUsername() : _host.NewAdminUsername();
                return (await ProxyTestClient.LoginAsync(_host, username), cluster.Name);
            }

            case Principal.DisabledCluster:
            {
                var username = (await data.UserAsync()).Username;
                var cluster = await data.ClusterAsync(isEnabled: false, apiUrl: _server.BaseAddress.ToString(), caBundlePem: _server.CaBundlePem);
                var credential = await data.CredentialAsync(cluster.Name);
                await data.GrantAsync(username, cluster.Name, credential.Id, AccessMode.ReadWrite);
                return (await ProxyTestClient.LoginAsync(_host, username), cluster.Name);
            }

            case Principal.ReadOnlyUser:
            {
                var username = (await data.UserAsync(isReadOnly: true)).Username;
                var (cluster, _) = await data.ProxyClusterAsync(_server, username, AccessMode.ReadWrite);
                return (await ProxyTestClient.LoginAsync(_host, username), cluster.Name);
            }

            case Principal.NoCsrfHeader:
            {
                var username = _host.NewUsername();
                var (cluster, _) = await data.ProxyClusterAsync(_server, username, AccessMode.ReadWrite);
                var client = await ProxyTestClient.LoginAsync(_host, username);
                client.Http.DefaultRequestHeaders.Remove(CsrfHeaderMiddleware.HeaderName);
                return (client, cluster.Name);
            }

            default:
            {
                var username = _host.NewUsername();
                var mode = principal == Principal.ReadOnlyGrant ? AccessMode.ReadOnly : AccessMode.ReadWrite;
                var (cluster, _) = await data.ProxyClusterAsync(_server, username, mode);
                return (await ProxyTestClient.LoginAsync(_host, username), cluster.Name);
            }
        }
    }

    private async Task ExpectAsync(ProxyTestClient client, HttpMethod method, string path, int status, string? code, List<string> failures)
    {
        var before = _server.Requests.Count;
        using var content = method == HttpMethod.Put ? new StringContent("{\"kind\":\"ConfigMap\"}", Encoding.UTF8, "application/json") : null;
        var request = new HttpRequestMessage(method, ProxyTestClient.RawUri(path)) { Content = content };
        using var response = await client.Http.SendAsync(request, Ct);
        var body = await response.Content.ReadAsStringAsync(Ct);
        var isProblem = response.Content.Headers.ContentType?.MediaType == "application/problem+json";
        var actualCode = isProblem && JsonDocument.Parse(body).RootElement.TryGetProperty("code", out var c) ? c.GetString() : null;
        var forwarded = _server.Requests.Count > before;

        // A FleetConsole refusal is a problem with the code and never reaches the cluster; a 200 is the cluster's body.
        var ok = (int)response.StatusCode == status && actualCode == code && (code is null ? forwarded && !isProblem : !forwarded);
        if (!ok)
        {
            failures.Add($"{method} {path} → {(int)response.StatusCode} {actualCode ?? "(no problem code)"} forwarded={forwarded}; expected {status} {code ?? "(upstream)"}");
        }
    }

    // The route with the cluster and the Kubernetes path filled in.
    private static string Fill(string pattern, string cluster) =>
        Regex.Replace(pattern, @"\{(\*\*)?(\w+)\}", m => m.Groups[2].Value switch
        {
            "cluster" => cluster,
            "path" => ConfigMap.TrimStart('/'),
            var other => throw new InvalidOperationException($"Unknown route parameter {other}: extend the matrix."),
        });

    /// <summary>One variant host and fake API server for the whole matrix (class fixture).</summary>
    /// <param name="factory">The collection's default host, which creates the variant.</param>
    public sealed class Host(ApiFactory factory) : IAsyncLifetime
    {
        /// <summary>The variant (revalidation on every request).</summary>
        public ApiFactory Api { get; private set; } = null!;

        /// <summary>The cluster every seeded cluster points at; answers GET and PUT of the ConfigMap with 200.</summary>
        public FakeKubeApiServer Server { get; private set; } = null!;

        /// <inheritdoc />
        public async ValueTask InitializeAsync()
        {
            Api = await factory.CreateVariantAsync(new Dictionary<string, string?> { ["Auth:RevalidationInterval"] = "00:00:00" });
            Server = await FakeKubeApiServer.StartAsync();
            Server.Respond("GET", ConfigMap, 200, new { kind = "ConfigMap", metadata = new { name = "web" } });
            Server.Respond("PUT", ConfigMap, 200, new { kind = "ConfigMap", metadata = new { name = "web" } });
        }

        /// <inheritdoc />
        public async ValueTask DisposeAsync()
        {
            await Server.DisposeAsync();
            await Api.DisposeAsync();
        }
    }
}
