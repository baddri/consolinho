using System.Net;
using System.Net.Http.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using FleetConsole.Application.Proxy;
using FleetConsole.Domain.Access;

namespace FleetConsole.Api.Tests.Integration.Proxy;

/// <summary>
/// PRX-7: each cluster is forwarded with its own trust only. Two fake API servers with two CAs: each works with its own
/// CA, a cluster configured with the other's CA fails (502 <c>UpstreamTls</c>) and recovers once its CA bundle is fixed
/// through the admin API (the forwarding pool rebuilds on the changed connection), and a skip-TLS cluster accepts a
/// wrong-host certificate while a verifying cluster pointing at the same server still fails.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProxyTlsIsolationTests(ApiFactory factory)
{
    private const string Pods = "/api/v1/namespaces/shop/pods";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Each_Cluster_Uses_Only_Its_Own_CA_And_A_Fixed_CA_Bundle_Takes_Effect_On_The_Next_Request()
    {
        await using var serverA = await StartAsync(FakeServerCertificate.Valid);
        await using var serverB = await StartAsync(FakeServerCertificate.Valid);
        var username = (await factory.Data.UserAsync()).Username;
        var a = await GrantedAsync(username, serverA, serverA.CaBundlePem);
        var b = await GrantedAsync(username, serverB, serverB.CaBundlePem);
        var aWithBsCa = await GrantedAsync(username, serverA, serverB.CaBundlePem);
        using var client = await ProxyTestClient.LoginAsync(factory, username);

        (await StatusAsync(client, a)).ShouldBe(HttpStatusCode.OK);
        (await StatusAsync(client, b)).ShouldBe(HttpStatusCode.OK);
        using (var wrong = await client.SendAsync(HttpMethod.Get, aWithBsCa, Pods))
        {
            await KubernetesProxyForwardingTests.ShouldBeProblemAsync(wrong, HttpStatusCode.BadGateway, ProxyErrors.UpstreamTls(aWithBsCa));
        }

        // The working clusters are unaffected by the failing one sharing server A's address.
        (await StatusAsync(client, a)).ShouldBe(HttpStatusCode.OK);

        using var admin = await factory.AdminClientAsync();
        var version = await admin.VersionAsync(aWithBsCa);
        using (var update = await admin.PutAsJsonAsync(
                   ClusterTestSupport.ClusterPath(aWithBsCa),
                   ClusterTestSupport.UpdateBody(version, body =>
                   {
                       body["apiUrl"] = serverA.BaseAddress.GetLeftPart(UriPartial.Authority);
                       body["caBundle"] = serverA.CaBundlePem;
                   }),
                   Ct))
        {
            update.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        (await StatusAsync(client, aWithBsCa)).ShouldBe(HttpStatusCode.OK);
        (await StatusAsync(client, b)).ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task SkipTls_Cluster_Accepts_A_WrongHost_Certificate_While_A_Verifying_Cluster_Still_Fails()
    {
        await using var server = await StartAsync(FakeServerCertificate.WrongHost);
        var username = (await factory.Data.UserAsync()).Username;
        var skip = await GrantedAsync(username, server, caBundlePem: null, skipTlsVerify: true);
        var verifying = await GrantedAsync(username, server, server.CaBundlePem);
        using var client = await ProxyTestClient.LoginAsync(factory, username);

        (await StatusAsync(client, skip)).ShouldBe(HttpStatusCode.OK);
        using (var failing = await client.SendAsync(HttpMethod.Get, verifying, Pods))
        {
            await KubernetesProxyForwardingTests.ShouldBeProblemAsync(failing, HttpStatusCode.BadGateway, ProxyErrors.UpstreamTls(verifying));
        }

        // Order doesn't matter: the skip-TLS handler is not shared with (or leaked into) the verifying cluster.
        (await StatusAsync(client, skip)).ShouldBe(HttpStatusCode.OK);
        using var again = await client.SendAsync(HttpMethod.Get, verifying, Pods);
        again.StatusCode.ShouldBe(HttpStatusCode.BadGateway);
    }

    private static async Task<FakeKubeApiServer> StartAsync(FakeServerCertificate certificate)
    {
        var server = await FakeKubeApiServer.StartAsync(certificate, Ct);
        server.Respond("GET", Pods, 200, new { kind = "PodList", items = Array.Empty<object>() });
        return server;
    }

    private async Task<string> GrantedAsync(string username, FakeKubeApiServer server, string? caBundlePem, bool skipTlsVerify = false)
    {
        var cluster = await factory.Data.ClusterAsync(apiUrl: server.BaseAddress.ToString(), caBundlePem: caBundlePem, skipTlsVerify: skipTlsVerify);
        var credential = await factory.Data.CredentialAsync(cluster.Name);
        await factory.Data.GrantAsync(username, cluster.Name, credential.Id, AccessMode.ReadOnly);
        return cluster.Name;
    }

    private static async Task<HttpStatusCode> StatusAsync(ProxyTestClient client, string cluster)
    {
        using var response = await client.SendAsync(HttpMethod.Get, cluster, Pods);
        return response.StatusCode;
    }
}
