using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Domain.Access;
using Microsoft.AspNetCore.Http;

namespace FleetConsole.Api.Tests.Integration.Fleet;

/// <summary>
/// <c>GET /api/fleet/status</c> end to end (CP5 contract §2, ADR-0041 §1): who may call it, the NDJSON framing and
/// headers, one line per accessible cluster with real probes against <see cref="FakeKubeApiServer"/>, and lines flushed
/// in completion order so a slow cluster never holds back a fast one.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class FleetStatusEndpointTests(ApiFactory factory)
{
    internal static readonly Uri StatusUri = new("/api/fleet/status", UriKind.Relative);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Anonymous_Is401()
    {
        using var client = factory.CreateApiClient();

        using var response = await client.GetAsync(StatusUri, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task DeactivatedUser_Is401()
    {
        // Every request re-reads the user, so the deactivation applies to the very next call.
        await using var host = await factory.CreateVariantAsync(new Dictionary<string, string?> { ["Auth:RevalidationInterval"] = "00:00:00" });
        var user = await host.Data.UserAsync();
        using var client = await host.LoginAsAsync(user.Username);
        await host.Data.DeactivateAsync(user.Username);

        using var response = await client.GetAsync(StatusUri, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task UserWithoutAccess_Gets200_EmptyNdjson_NotCached()
    {
        var user = await factory.Data.UserAsync();
        using var client = await factory.LoginAsAsync(user.Username);

        using var response = await client.GetAsync(StatusUri, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/x-ndjson");
        response.Headers.CacheControl?.NoStore.ShouldBeTrue();
        (await response.Content.ReadAsStringAsync(Ct)).ShouldBeEmpty();
    }

    [Fact]
    public async Task TwoClusters_OneLineEach_UnreachableAndFullFacts_CamelCaseStringEnums()
    {
        var username = factory.NewUsername();
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapClusterVersion("4.17.3", history: [("Completed", "4.17.3")]);
        server.MapClusterOperatorsTable(("True", "False", "False"), ("True", "False", "True"));
        server.MapNodesTable("Ready", "Ready,SchedulingDisabled", "NotReady");
        var (healthy, _) = await factory.Data.ProxyClusterAsync(server, username, AccessMode.ReadOnly);
        var down = await ClosedPortClusterAsync(username);
        using var client = await factory.LoginAsAsync(username);

        using var response = await client.GetAsync(StatusUri, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var body = await response.Content.ReadAsStringAsync(Ct);
        body.ShouldEndWith("\n");
        var lines = body.Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(line => JsonDocument.Parse(line).RootElement).ToList();
        lines.Count.ShouldBe(2);
        var byName = lines.ToDictionary(line => line.GetProperty("cluster").GetProperty("name").GetString()!);

        var unreachable = byName[down];
        unreachable.GetProperty("failure").GetString().ShouldBe("unreachable");
        unreachable.GetProperty("nodes").ValueKind.ShouldBe(JsonValueKind.Null);

        var facts = byName[healthy.Name];
        facts.EnumerateObject().Select(p => p.Name).ShouldBe(
            ["cluster", "checkedAt", "failure", "kubernetesVersion", "clusterVersion", "clusterOperators", "nodes"], ignoreOrder: true);
        facts.GetProperty("failure").ValueKind.ShouldBe(JsonValueKind.Null);
        facts.GetProperty("cluster").GetProperty("distribution").GetString().ShouldBe("openShift");
        facts.GetProperty("cluster").GetProperty("accessMode").GetString().ShouldBe("readOnly");
        facts.GetProperty("kubernetesVersion").ValueKind.ShouldBe(JsonValueKind.Null);
        var version = facts.GetProperty("clusterVersion");
        version.GetProperty("outcome").GetString().ShouldBe("ok");
        version.GetProperty("currentVersion").GetString().ShouldBe("4.17.3");
        var operators = facts.GetProperty("clusterOperators");
        operators.GetProperty("total").GetInt32().ShouldBe(2);
        operators.GetProperty("degraded").GetInt32().ShouldBe(1);
        var nodes = facts.GetProperty("nodes");
        nodes.GetProperty("outcome").GetString().ShouldBe("ok");
        (nodes.GetProperty("total").GetInt32(), nodes.GetProperty("ready").GetInt32(), nodes.GetProperty("notReady").GetInt32(),
            nodes.GetProperty("unschedulable").GetInt32()).ShouldBe((3, 2, 1, 1));
    }

    [Fact]
    public async Task FirstLine_IsReadable_BeforeASlowClusterFinishes()
    {
        var username = factory.NewUsername();
        await using var fast = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        await using var slow = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        foreach (var server in new[] { fast, slow })
        {
            server.MapClusterVersion();
            server.MapClusterOperatorsTable(("True", "False", "False"));
            server.MapNodesTable("Ready");
        }

        // The slow cluster's Nodes probe waits for the test (well within the default 5 s ClusterTimeout once released).
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        slow.MapGet(FakeKubeApiServer.NodesPath, async context =>
        {
            await release.Task.WaitAsync(context.RequestAborted);
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(
                JsonSerializer.Serialize(FakeKubeApiServer.Table(["Name", "Status"], [["node-0", "Ready"]])), context.RequestAborted);
        });
        var (fastCluster, _) = await factory.Data.ProxyClusterAsync(fast, username, AccessMode.ReadOnly);
        var (slowCluster, _) = await factory.Data.ProxyClusterAsync(slow, username, AccessMode.ReadOnly);
        using var client = await factory.LoginAsAsync(username);

        using var response = await client.GetAsync(StatusUri, HttpCompletionOption.ResponseHeadersRead, Ct)
            .WaitAsync(TimeSpan.FromSeconds(15), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        await using var body = await response.Content.ReadAsStreamAsync(Ct);
        using var reader = new StreamReader(body);

        var first = await reader.ReadLineAsync(Ct).AsTask().WaitAsync(TimeSpan.FromSeconds(15), Ct);
        ClusterName(first).ShouldBe(fastCluster.Name);
        release.SetResult();
        var second = await reader.ReadLineAsync(Ct).AsTask().WaitAsync(TimeSpan.FromSeconds(15), Ct);
        ClusterName(second).ShouldBe(slowCluster.Name);
        (await reader.ReadLineAsync(Ct)).ShouldBeNull();
    }

    private static string? ClusterName(string? line) =>
        JsonDocument.Parse(line.ShouldNotBeNull()).RootElement.GetProperty("cluster").GetProperty("name").GetString();

    /// <summary>A granted cluster whose API URL is a loopback port nothing listens on (connection refused).</summary>
    private async Task<string> ClosedPortClusterAsync(string username)
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();

        var cluster = await factory.Data.ClusterAsync(apiUrl: $"https://127.0.0.1:{port}");
        var credential = await factory.Data.CredentialAsync(cluster.Name);
        await factory.Data.GrantAsync(username, cluster.Name, credential.Id);
        return cluster.Name;
    }
}
