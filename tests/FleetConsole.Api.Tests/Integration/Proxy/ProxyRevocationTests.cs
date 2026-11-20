using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using FleetConsole.Api.Tests.Integration.Admin.Grants;
using FleetConsole.Application.Proxy;
using FleetConsole.Domain.Access;

namespace FleetConsole.Api.Tests.Integration.Proxy;

/// <summary>
/// PRX-3: access changes take effect on the next proxied request of an open session — grant revoked or cluster disabled
/// (admin API) → 404, user deactivated → 401 — and an open watch ends within the watch cap, after which the re-watch is
/// re-authorized (404 once revoked).
/// </summary>
/// <remarks>
/// One variant for the class: <c>Auth:RevalidationInterval=0</c> (deactivation is seen on the next request, production
/// within the interval) and <c>Proxy:WatchTimeoutCap=2s</c> (production 5 min) so the watch test is short.
/// </remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProxyRevocationTests(ProxyRevocationTests.Host fixture) : IClassFixture<ProxyRevocationTests.Host>
{
    private const string Pods = "/api/v1/namespaces/shop/pods";

    private readonly ApiFactory _host = fixture.Api;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Revoked_Grant_Is_404_On_The_Next_Request()
    {
        await using var server = await StartServerAsync();
        var (client, cluster, grantId, _) = await SignedInAsync(server);
        using var _ = client;
        (await StatusAsync(client, cluster)).ShouldBe(HttpStatusCode.OK);

        using var admin = await _host.AdminClientAsync();
        using (var revoke = await GrantsApi.RevokeAsync(admin, grantId.Value))
        {
            revoke.IsSuccessStatusCode.ShouldBeTrue();
        }

        using var response = await client.SendAsync(HttpMethod.Get, cluster, Pods);
        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(response, HttpStatusCode.NotFound, ProxyErrors.NotAvailable(cluster));
    }

    [Fact]
    public async Task Disabled_Cluster_Is_404_On_The_Next_Request()
    {
        await using var server = await StartServerAsync();
        var (client, cluster, _, _) = await SignedInAsync(server);
        using var __ = client;
        (await StatusAsync(client, cluster)).ShouldBe(HttpStatusCode.OK);

        using var admin = await _host.AdminClientAsync();
        var version = await admin.VersionAsync(cluster);
        using (var disable = await admin.PostAsJsonAsync($"{ClusterTestSupport.ClusterPath(cluster)}/disable", new { version }, Ct))
        {
            disable.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        using var response = await client.SendAsync(HttpMethod.Get, cluster, Pods);
        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(response, HttpStatusCode.NotFound, ProxyErrors.NotAvailable(cluster));
    }

    [Fact]
    public async Task Deactivated_User_Is_401_On_The_Next_Request()
    {
        await using var server = await StartServerAsync();
        var (client, cluster, _, username) = await SignedInAsync(server);
        using var __ = client;
        (await StatusAsync(client, cluster)).ShouldBe(HttpStatusCode.OK);
        var forwarded = server.Requests.Count;

        await _host.Data.DeactivateAsync(username);

        using var response = await client.SendAsync(HttpMethod.Get, cluster, Pods);
        response.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await ProxyTestClient.ProblemAsync(response)).GetProperty("code").GetString().ShouldBe("Auth.Unauthenticated");
        server.Requests.Count.ShouldBe(forwarded);
    }

    [Fact]
    public async Task Open_Watch_Ends_Within_The_Cap_And_The_ReWatch_After_Revocation_Is_404()
    {
        await using var server = await StartServerAsync();
        var watch = server.MapWatch(Pods);
        var (client, cluster, grantId, _) = await SignedInAsync(server);
        using var _ = client;

        var clock = Stopwatch.StartNew();
        using var response = await client.SendAsync(HttpMethod.Get, cluster, Pods + "?watch=1&timeoutSeconds=300",
            completion: HttpCompletionOption.ResponseHeadersRead).WaitAsync(TimeSpan.FromSeconds(10), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await watch.Connected.WaitAsync(TimeSpan.FromSeconds(10), Ct)).ShouldBe(2, "the proxy caps timeoutSeconds at WatchTimeoutCap");

        using (var admin = await _host.AdminClientAsync())
        using (var revoke = await GrantsApi.RevokeAsync(admin, grantId.Value))
        {
            revoke.IsSuccessStatusCode.ShouldBeTrue();
        }

        // The stream ends by itself (the apiserver honours the capped timeoutSeconds); generous bound, cap is 2 s.
        await using (var stream = await response.Content.ReadAsStreamAsync(Ct))
        {
            await stream.CopyToAsync(Stream.Null, Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct);
        }

        clock.Elapsed.ShouldBeLessThan(TimeSpan.FromSeconds(6));

        using var rewatch = await client.SendAsync(HttpMethod.Get, cluster, Pods + "?watch=1&timeoutSeconds=300",
            completion: HttpCompletionOption.ResponseHeadersRead);
        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(rewatch, HttpStatusCode.NotFound, ProxyErrors.NotAvailable(cluster));
    }

    private static async Task<FakeKubeApiServer> StartServerAsync()
    {
        var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", Pods, 200, new { kind = "PodList", items = Array.Empty<object>() });
        return server;
    }

    // A fresh user with a ReadOnly grant on a cluster at server, signed in.
    private async Task<(ProxyTestClient Client, string Cluster, GrantId Grant, string Username)> SignedInAsync(FakeKubeApiServer server)
    {
        var username = _host.NewUsername();
        var (cluster, _) = await _host.Data.ProxyClusterAsync(server, username, AccessMode.ReadOnly);
        var grant = await GrantIdAsync(username, cluster.Name);
        return (await ProxyTestClient.LoginAsync(_host, username), cluster.Name, grant, username);
    }

    private async Task<GrantId> GrantIdAsync(string username, string cluster)
    {
        using var admin = await _host.AdminClientAsync();
        var grant = (await GrantsApi.UserGrantsAsync(admin, username)).Single(g => g.GetProperty("clusterName").GetString() == cluster);
        return new GrantId(grant.GetProperty("id").GetGuid());
    }

    private static async Task<HttpStatusCode> StatusAsync(ProxyTestClient client, string cluster)
    {
        using var response = await client.SendAsync(HttpMethod.Get, cluster, Pods);
        return response.StatusCode;
    }

    /// <summary>The variant shared by the class.</summary>
    /// <param name="factory">The collection's default host, which creates the variant.</param>
    public sealed class Host(ApiFactory factory) : IAsyncLifetime
    {
        /// <summary>The variant.</summary>
        public ApiFactory Api { get; private set; } = null!;

        /// <inheritdoc />
        public async ValueTask InitializeAsync() =>
            Api = await factory.CreateVariantAsync(new Dictionary<string, string?>
            {
                ["Auth:RevalidationInterval"] = "00:00:00",
                ["Proxy:WatchTimeoutCap"] = "00:00:02",
            });

        /// <inheritdoc />
        public async ValueTask DisposeAsync() => await Api.DisposeAsync();
    }
}
