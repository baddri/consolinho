using System.Net;
using System.Text;
using System.Text.Json;
using FleetConsole.Api.Http;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Application.Proxy;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;

namespace FleetConsole.Api.Tests.Integration.Proxy;

/// <summary>
/// What the proxy refuses before anything is forwarded, on real PostgreSQL (the authorization query's SQL): access
/// (PRX-2), path (PRX-4), CSRF (SEC-3), mutation guard and body limit (MUT-2/3/5), WebSocket origin — and which
/// requests are audited (PAUD-1/2). ADR-0019 §1 order, CP2 contract §4–5.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class KubernetesProxyAuthorizationTests(ApiFactory factory)
{
    private const string Pods = "/api/v1/namespaces/shop/pods";
    private const string ConfigMap = "/api/v1/namespaces/shop/configmaps/web";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Unknown_Disabled_And_Ungranted_Clusters_Are_The_Same_404()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var username = factory.NewUsername();
        await factory.Data.ProxyClusterAsync(server, username, AccessMode.ReadWrite); // the user has *some* access
        var disabled = await factory.Data.ClusterAsync(isEnabled: false, apiUrl: server.BaseAddress.ToString(), caBundlePem: server.CaBundlePem);
        var credential = await factory.Data.CredentialAsync(disabled.Name);
        await factory.Data.GrantAsync(username, disabled.Name, credential.Id, AccessMode.ReadWrite);
        var ungranted = await factory.Data.ClusterAsync(apiUrl: server.BaseAddress.ToString(), caBundlePem: server.CaBundlePem);
        await factory.Data.CredentialAsync(ungranted.Name);
        using var client = await ProxyTestClient.LoginAsync(factory, username);

        List<JsonElement> problems = [];
        foreach (var cluster in new[] { $"unknown-{TestData.Unique()}", disabled.Name, ungranted.Name })
        {
            using var response = await client.SendAsync(HttpMethod.Get, cluster, Pods);
            await KubernetesProxyForwardingTests.ShouldBeProblemAsync(response, HttpStatusCode.NotFound, ProxyErrors.NotAvailable(cluster));
            problems.Add(await ProxyTestClient.ProblemAsync(response));
        }

        problems.Select(Shape).Distinct().Count().ShouldBe(1);
        server.Requests.ShouldBeEmpty();
    }

    [Theory]
    [InlineData("/healthz")]
    [InlineData("/api/%2e%2e/x")]
    [InlineData("/api/v1/namespaces%2Fx")]
    [InlineData("/api/v1//namespaces")]
    [InlineData("")]
    public async Task Disallowed_Paths_Are_400_And_Not_Forwarded(string path)
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var (client, cluster) = await SetUpAsync(server, AccessMode.ReadWrite);
        using var _ = client;

        foreach (var name in new[] { cluster, "x" })
        {
            using var response = await client.SendAsync(HttpMethod.Get, name, path);
            await KubernetesProxyForwardingTests.ShouldBeProblemAsync(response, HttpStatusCode.BadRequest, ProxyErrors.PathNotAllowed);
        }

        server.Requests.ShouldBeEmpty();
    }

    [Fact]
    public async Task Mutation_Without_Csrf_Header_Is_403_And_Not_Forwarded()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var (client, cluster) = await SetUpAsync(server, AccessMode.ReadWrite);
        using var _ = client;
        client.Http.DefaultRequestHeaders.Remove(CsrfHeaderMiddleware.HeaderName);

        using var response = await client.SendAsync(HttpMethod.Put, cluster, ConfigMap, Json("{}"));

        response.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await ProxyTestClient.ProblemAsync(response)).GetProperty("code").GetString().ShouldBe("Auth.CsrfHeaderMissing");
        server.Requests.ShouldBeEmpty();
    }

    [Fact]
    public async Task ReadOnly_User_Mutation_Is_403_UserReadOnly()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var user = await factory.Data.UserAsync(isReadOnly: true);
        var (cluster, _) = await factory.Data.ProxyClusterAsync(server, user.Username, AccessMode.ReadWrite);
        using var client = await ProxyTestClient.LoginAsync(factory, user.Username);

        using var response = await client.SendAsync(HttpMethod.Put, cluster.Name, ConfigMap, Json("{}"));

        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(response, HttpStatusCode.Forbidden, ProxyErrors.UserReadOnly);
        server.Requests.ShouldBeEmpty();
    }

    [Fact]
    public async Task ReadOnly_Grant_Mutation_Is_403_And_SelfSubjectAccessReview_Is_Forwarded()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("POST", FakeKubeApiServer.AccessReviewsPath, 201, new { kind = "SelfSubjectAccessReview", status = new { allowed = true } });
        var (client, cluster) = await SetUpAsync(server, AccessMode.ReadOnly);
        using var _ = client;

        using var denied = await client.SendAsync(HttpMethod.Delete, cluster, Pods + "/web-1");
        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(denied, HttpStatusCode.Forbidden, ProxyErrors.ReadOnlyGrant(cluster));
        server.Requests.ShouldBeEmpty();

        using var review = await client.SendAsync(HttpMethod.Post, cluster, FakeKubeApiServer.AccessReviewsPath, Json("{\"kind\":\"SelfSubjectAccessReview\"}"));
        review.StatusCode.ShouldBe(HttpStatusCode.Created);
        server.Requests.ShouldHaveSingleItem().Method.ShouldBe("POST");
    }

    [Fact]
    public async Task Body_Over_The_Limit_Is_413_By_Content_Length()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var (client, cluster) = await SetUpAsync(server, AccessMode.ReadWrite);
        using var _ = client;
        var tooLarge = new ByteArrayContent(new byte[(10 * 1024 * 1024) + 1]);
        tooLarge.Headers.ContentType = new("application/json");

        using var response = await client.SendAsync(HttpMethod.Put, cluster, ConfigMap, tooLarge);

        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(response, HttpStatusCode.RequestEntityTooLarge, ProxyErrors.BodyTooLarge(10 * 1024 * 1024));
        server.Requests.ShouldBeEmpty();
    }

    [Fact]
    public async Task Allowed_Mutation_Is_Audited_Once_And_Reads_Watches_And_Reviews_Are_Not()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", Pods, 200, new { kind = "PodList" });
        server.Respond("PUT", ConfigMap, 200, new { kind = "ConfigMap" });
        server.Respond("POST", FakeKubeApiServer.AccessReviewsPath, 201, new { kind = "SelfSubjectAccessReview" });
        server.MapWatch(Pods);
        var username = factory.NewUsername();
        var (cluster, _) = await factory.Data.ProxyClusterAsync(server, username, AccessMode.ReadWrite);
        using var client = await ProxyTestClient.LoginAsync(factory, username);

        (await client.SendAsync(HttpMethod.Get, cluster.Name, Pods)).Dispose();
        (await client.SendAsync(HttpMethod.Get, cluster.Name, Pods + "?watch=1&timeoutSeconds=1")).Dispose();
        (await client.SendAsync(HttpMethod.Post, cluster.Name, FakeKubeApiServer.AccessReviewsPath, Json("{}"))).Dispose();
        using var put = await client.SendAsync(HttpMethod.Put, cluster.Name, ConfigMap, Json("{}"));
        put.StatusCode.ShouldBe(HttpStatusCode.OK);

        var entry = (await ProxyEntriesAsync(username)).ShouldHaveSingleItem();
        entry.Action.ShouldBe("proxy.update");
        entry.ClusterName.ShouldBe(cluster.Name);
        entry.TargetName.ShouldBe("shop/configmaps/web");
        using var details = JsonDocument.Parse(entry.DetailsJson);
        details.RootElement.GetProperty("statusCode").GetInt32().ShouldBe(200);
        details.RootElement.GetProperty("outcome").GetString().ShouldBe("allowed");
    }

    [Fact]
    public async Task Denied_Mutation_Is_Audited_Once()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var username = factory.NewUsername();
        var (cluster, _) = await factory.Data.ProxyClusterAsync(server, username, AccessMode.ReadOnly);
        using var client = await ProxyTestClient.LoginAsync(factory, username);

        using var response = await client.SendAsync(HttpMethod.Delete, cluster.Name, Pods + "/web-1");
        response.StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        var entry = (await ProxyEntriesAsync(username)).ShouldHaveSingleItem();
        entry.Action.ShouldBe("proxy.delete");
        using var details = JsonDocument.Parse(entry.DetailsJson);
        details.RootElement.GetProperty("statusCode").GetInt32().ShouldBe(403);
        details.RootElement.GetProperty("outcome").GetString().ShouldBe("denied");
        details.RootElement.GetProperty("reason").GetString().ShouldBe("readOnlyGrant");
    }

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData(null)]
    public async Task WebSocket_Upgrade_From_A_Foreign_Origin_Is_403(string? origin)
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var (client, cluster) = await SetUpAsync(server, AccessMode.ReadWrite);
        using var _ = client;
        var target = $"/api/clusters/{cluster}/k8s{Pods}/web-1/exec?command=sh&stdin=true";
        var ws = factory.Server.CreateWebSocketClient();
        HttpResponse? seen = null;
        ws.ConfigureRequest = request =>
        {
            request.Headers.Cookie = client.CookieHeader;
            if (origin is not null)
            {
                request.Headers.Origin = origin;
            }

            request.HttpContext.Features.GetRequiredFeature<IHttpRequestFeature>().RawTarget = target;
            seen = request.HttpContext.Response;
        };

        var failure = await Should.ThrowAsync<InvalidOperationException>(() => ws.ConnectAsync(new Uri("ws://localhost" + target), Ct));

        failure.Message.ShouldContain("403");
        seen.ShouldNotBeNull().StatusCode.ShouldBe(StatusCodes.Status403Forbidden);
        server.Requests.ShouldBeEmpty();
    }

    private async Task<(ProxyTestClient Client, string Cluster)> SetUpAsync(FakeKubeApiServer server, AccessMode mode)
    {
        var username = factory.NewUsername();
        var (cluster, _) = await factory.Data.ProxyClusterAsync(server, username, mode);
        return (await ProxyTestClient.LoginAsync(factory, username), cluster.Name);
    }

    private async Task<List<AuditEntry>> ProxyEntriesAsync(string username) =>
        [.. (await factory.Data.AuditEntriesAsync(username)).Where(e => e.Category == AuditCategory.Proxy)];

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    // Keys, type, title, status and code — everything but the per-request traceId/instance and the named detail.
    private static string Shape(JsonElement problem) => string.Join('|',
        problem.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal)
            .Concat([problem.GetProperty("type").ToString(), problem.GetProperty("title").ToString(),
                problem.GetProperty("status").ToString(), problem.GetProperty("code").ToString()]));
}
