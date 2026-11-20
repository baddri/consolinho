using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Application.Proxy;
using FleetConsole.Domain.Access;
using Microsoft.AspNetCore.Http;

namespace FleetConsole.Api.Tests.Integration.Proxy;

/// <summary>
/// <c>ANY /api/clusters/{cluster}/k8s/{**path}</c> against the fake apiserver: what reaches the cluster (PRX-1, SEC-1),
/// what comes back (SEC-2, PRX-5), forwarding failures (PRX-6) and a basic watch (PRX-8). CP2 contract §1–4.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class KubernetesProxyForwardingTests(ApiFactory factory)
{
    private const string Pods = "/api/v1/namespaces/shop/pods";
    private const string ConfigMap = "/api/v1/namespaces/shop/configmaps/web%3A1";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Get_List_Reaches_The_Cluster_Unchanged_With_The_Granted_Token()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Map("GET", Pods, async context =>
        {
            context.Response.ContentType = "application/json;stream=watch-not";
            await context.Response.WriteAsync("""{"kind":"PodList","items":[]}""", Ct);
        });
        var (client, cluster, token) = await SetUpAsync(server, AccessMode.ReadOnly);
        using var _ = client;

        using var response = await client.SendAsync(HttpMethod.Get, cluster, Pods + "?limit=250&labelSelector=app%3Dweb");

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.ToString().ShouldBe("application/json; stream=watch-not");
        (await response.Content.ReadAsStringAsync(Ct)).ShouldBe("""{"kind":"PodList","items":[]}""");
        var seen = server.Requests.ShouldHaveSingleItem();
        seen.Method.ShouldBe("GET");
        seen.RawTarget.ShouldBe(Pods + "?limit=250&labelSelector=app%3Dweb");
        seen.Headers["Authorization"].ShouldBe([$"Bearer {token}"]);
    }

    [Theory]
    [InlineData("PUT", "application/json")]
    [InlineData("PATCH", "application/merge-patch+json")]
    [InlineData("DELETE", "application/json")]
    public async Task Mutations_Reach_The_Cluster_With_Method_Raw_Path_Query_And_Body(string method, string contentType)
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Map(method, "/api/v1/namespaces/shop/configmaps/web:1", async context =>
        {
            context.Response.StatusCode = 200;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync("""{"kind":"ConfigMap"}""", Ct);
        });
        var (client, cluster, _) = await SetUpAsync(server, AccessMode.ReadWrite);
        using var __ = client;
        const string body = """{"kind":"ConfigMap","data":{"a":"b"}}""";

        using var response = await client.SendAsync(
            new HttpMethod(method), cluster, ConfigMap + "?fieldManager=console&dryRun=All",
            new StringContent(body, Encoding.UTF8, MediaTypeHeaderValue.Parse(contentType)));

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await response.Content.ReadAsStringAsync(Ct)).ShouldBe("""{"kind":"ConfigMap"}""");
        var seen = server.Requests.ShouldHaveSingleItem();
        seen.Method.ShouldBe(method);
        seen.RawTarget.ShouldBe(ConfigMap + "?fieldManager=console&dryRun=All");
        seen.Body.ShouldBe(body);
        seen.Headers["Content-Type"].ShouldHaveSingleItem().ShouldStartWith(contentType);
    }

    [Theory]
    [InlineData(404)]
    [InlineData(409)]
    [InlineData(422)]
    [InlineData(403)]
    public async Task Upstream_Status_Errors_Pass_Through_Untouched(int status)
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        const string statusBody = """{"kind":"Status","apiVersion":"v1","status":"Failure","message":"nope","reason":"Conflict","code":409}""";
        if (status != 404)
        {
            server.Map("GET", Pods, async context =>
            {
                context.Response.StatusCode = status;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync(statusBody, Ct);
            });
        }

        var (client, cluster, _) = await SetUpAsync(server, AccessMode.ReadOnly);
        using var __ = client;

        using var response = await client.SendAsync(HttpMethod.Get, cluster, status == 404 ? "/api/v1/nothing-here" : Pods);

        ((int)response.StatusCode).ShouldBe(status);
        response.Content.Headers.ContentType!.MediaType.ShouldBe("application/json");
        var text = await response.Content.ReadAsStringAsync(Ct);
        if (status == 404)
        {
            JsonDocument.Parse(text).RootElement.GetProperty("kind").GetString().ShouldBe("Status");
        }
        else
        {
            text.ShouldBe(statusBody);
        }
    }

    [Fact]
    public async Task Upstream_401_Becomes_502_CredentialRejected_Without_WWW_Authenticate()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.RespondWithHeaders("GET", Pods, 401, new Dictionary<string, string> { ["WWW-Authenticate"] = "Bearer realm=\"kubernetes\"" });
        var (client, cluster, _) = await SetUpAsync(server, AccessMode.ReadOnly);
        using var __ = client;

        using var response = await client.SendAsync(HttpMethod.Get, cluster, Pods);

        response.StatusCode.ShouldBe(HttpStatusCode.BadGateway);
        response.Headers.WwwAuthenticate.ShouldBeEmpty();
        var problem = await ProxyTestClient.ProblemAsync(response);
        problem.GetProperty("code").GetString().ShouldBe("Proxy.CredentialRejected");
        problem.GetProperty("detail").GetString().ShouldBe(ProxyErrors.CredentialRejected(cluster).Message);
    }

    [Fact]
    public async Task Client_Identity_Headers_Are_Stripped_And_Only_The_SA_Token_Is_Sent()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.RespondWithHeaders("GET", Pods, 200, new Dictionary<string, string>
        {
            ["Set-Cookie"] = "upstream=sec2; Path=/",
            ["WWW-Authenticate"] = "Basic realm=sec2",
            ["X-Upstream-Kept"] = "yes",
        });
        var (client, cluster, token) = await SetUpAsync(server, AccessMode.ReadOnly);
        using var __ = client;
        string[] stripped =
        [
            "Proxy-Authorization", "Forwarded", "Impersonate-User", "Impersonate-Group", "Impersonate-Extra-Scopes",
            "Impersonate-Uid", "X-Remote-User", "X-Remote-Group", "X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto",
        ];

        using var response = await client.SendAsync(HttpMethod.Get, cluster, Pods, configure: request =>
        {
            request.Headers.TryAddWithoutValidation("Authorization", "Bearer sec1-client-token");
            request.Headers.TryAddWithoutValidation("Cookie", "sec1=cookie");
            foreach (var name in stripped)
            {
                request.Headers.TryAddWithoutValidation(name, "sec1-" + name);
            }
        });

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Headers.Contains("Set-Cookie").ShouldBeFalse();
        response.Headers.WwwAuthenticate.ShouldBeEmpty();
        response.Headers.GetValues("X-Upstream-Kept").ShouldBe(["yes"]);

        var seen = server.Requests.ShouldHaveSingleItem();
        seen.Headers["Authorization"].ShouldBe([$"Bearer {token}"]);
        foreach (var name in stripped.Concat(["Cookie", "X-Console-Request"]))
        {
            seen.Headers.ContainsKey(name).ShouldBeFalse(name);
        }

        seen.Headers.SelectMany(h => h.Value).ShouldNotContain(v => v.Contains("sec1", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Stopped_Server_Gives_502_UpstreamUnavailable()
    {
        var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var (client, cluster, _) = await SetUpAsync(server, AccessMode.ReadOnly);
        using var __ = client;
        await server.DisposeAsync();

        using var response = await client.SendAsync(HttpMethod.Get, cluster, Pods);

        await ShouldBeProblemAsync(response, HttpStatusCode.BadGateway, ProxyErrors.UpstreamUnavailable(cluster));
    }

    [Fact]
    public async Task Untrusted_Certificate_Gives_502_UpstreamTls()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var username = factory.NewUsername();
        await factory.Data.UserAsync(username);
        var cluster = await factory.Data.ClusterAsync(apiUrl: server.BaseAddress.ToString()); // no CA bundle
        var credential = await factory.Data.CredentialAsync(cluster.Name);
        await factory.Data.GrantAsync(username, cluster.Name, credential.Id);
        using var client = await ProxyTestClient.LoginAsync(factory, username);

        using var response = await client.SendAsync(HttpMethod.Get, cluster.Name, Pods);

        await ShouldBeProblemAsync(response, HttpStatusCode.BadGateway, ProxyErrors.UpstreamTls(cluster.Name));
        server.Requests.ShouldBeEmpty();
    }

    [Fact]
    public async Task Response_Slower_Than_RequestTimeout_Gives_504_UpstreamTimeout()
    {
        await using var variant = await factory.CreateVariantAsync(new Dictionary<string, string?> { ["Proxy:RequestTimeout"] = "00:00:01" });
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Delay("GET", Pods, TimeSpan.FromSeconds(10));
        var username = variant.NewUsername();
        var (cluster, _) = await variant.Data.ProxyClusterAsync(server, username, AccessMode.ReadOnly);
        using var client = await ProxyTestClient.LoginAsync(variant, username);

        using var response = await client.SendAsync(HttpMethod.Get, cluster.Name, Pods);

        await ShouldBeProblemAsync(response, HttpStatusCode.GatewayTimeout, ProxyErrors.UpstreamTimeout(cluster.Name));
    }

    [Fact]
    public async Task Watch_Is_Streamed_With_Capped_TimeoutSeconds()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var watch = server.MapWatch(Pods);
        var (client, cluster, _) = await SetUpAsync(server, AccessMode.ReadOnly);
        using var __ = client;

        var sending = client.SendAsync(HttpMethod.Get, cluster, Pods + "?watch=1&timeoutSeconds=1000&allowWatchBookmarks=true",
            completion: HttpCompletionOption.ResponseHeadersRead);
        (await watch.Connected.WaitAsync(TimeSpan.FromSeconds(10), Ct)).ShouldBe(300);
        await watch.SendAsync("ADDED", new { kind = "Pod", metadata = new { name = "web-1" } }, Ct);
        using var response = await sending.WaitAsync(TimeSpan.FromSeconds(10), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        await using var stream = await response.Content.ReadAsStreamAsync(Ct);
        using var reader = new StreamReader(stream);
        var line = await reader.ReadLineAsync(Ct).AsTask().WaitAsync(TimeSpan.FromSeconds(10), Ct);
        line.ShouldNotBeNull().ShouldContain("\"ADDED\"");
        line.ShouldContain("web-1");
    }

    private async Task<(ProxyTestClient Client, string Cluster, string Token)> SetUpAsync(FakeKubeApiServer server, AccessMode mode)
    {
        var username = factory.NewUsername();
        var (cluster, credential) = await factory.Data.ProxyClusterAsync(server, username, mode);
        return (await ProxyTestClient.LoginAsync(factory, username), cluster.Name, credential.Token);
    }

    internal static async Task ShouldBeProblemAsync(HttpResponseMessage response, HttpStatusCode status, FleetConsole.Domain.Common.Error error)
    {
        response.StatusCode.ShouldBe(status);
        var problem = await ProxyTestClient.ProblemAsync(response);
        problem.GetProperty("code").GetString().ShouldBe(error.Code);
        problem.GetProperty("detail").GetString().ShouldBe(error.Message); // never exception text
    }
}
