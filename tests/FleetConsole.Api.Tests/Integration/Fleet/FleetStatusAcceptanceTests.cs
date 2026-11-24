using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Runtime.CompilerServices;
using System.Text.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Api.Tests.Integration.Admin.Credentials;
using FleetConsole.Api.Tests.Integration.Admin.Grants;
using FleetConsole.Api.Tests.Persistence;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Integration.Fleet;

/// <summary>
/// QA acceptance of <c>GET /api/fleet/status</c> (T-0325, CP5 spec §5c.2 FBE-1..7, QG5C-1 matrix rows 1–6) end to end
/// through the real handler, probe, cache and Infrastructure reader against <see cref="FakeKubeApiServer"/>s: only
/// effectively granted, enabled clusters; the winning grant's token on the wire; cache entries isolated per credential
/// and shared by users of one credential; error rows next to healthy ones; the per-request cluster fan-out bound;
/// invalidation on rotation; probes cancelled when the browser goes away.
/// </summary>
/// <remarks>One variant for the class: <c>Fleet:ClusterTimeout</c> 1 s (row 4) and <c>Fleet:MaxClusterConcurrency</c> 3 (row 5).</remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class FleetStatusAcceptanceTests(FleetStatusAcceptanceTests.Host fixture) : IClassFixture<FleetStatusAcceptanceTests.Host>
{
    private readonly ApiFactory _host = fixture.Api;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // Row 1 (FBE-1, FBE-7): direct grant on A, group grant on B, nothing on C, a granted but disabled D → exactly A and B.
    [Fact]
    public async Task Lines_are_exactly_the_directly_and_group_granted_enabled_clusters()
    {
        await using var server = await HealthyOpenShiftAsync();
        var username = _host.NewUsername();
        var group = "grp-" + TestData.Unique();
        var (direct, _) = await _host.Data.ProxyClusterAsync(server, username, AccessMode.ReadOnly);
        var viaGroup = await FakeClusterAsync(server);
        var notGranted = await FakeClusterAsync(server);
        var disabled = await FakeClusterAsync(server, isEnabled: false);
        await _host.Data.GrantAsync(username, disabled.Name, (await _host.Data.CredentialAsync(disabled.Name)).Id);
        await _host.Data.CredentialAsync(notGranted.Name);

        using (var admin = await _host.LoginAsAsync(_host.NewAdminUsername()))
        {
            var credential = await _host.Data.CredentialAsync(viaGroup.Name);
            using var created = await GrantsApi.CreateGroupAsync(admin, group, viaGroup.Name, credential.Id.Value, priority: 10);
            created.StatusCode.ShouldBe(HttpStatusCode.Created);
        }

        using var client = await _host.LoginAsAsync(username);
        await SetGroupsAsync(username, group);

        var lines = await StatusLinesAsync(client);

        lines.Select(Name).ShouldBe([direct.Name, viaGroup.Name], ignoreOrder: true);
        lines.ShouldAllBe(line => line.GetProperty("failure").ValueKind == JsonValueKind.Null);
        lines.Single(l => Name(l) == viaGroup.Name).GetProperty("cluster").GetProperty("accessMode").GetString().ShouldBe("readOnly");
    }

    // Row 2 (FBE-2): the fake sees the RO user's winning (RO) credential and the RW user's RW credential, never swapped.
    [Fact]
    public async Task Each_user_is_probed_with_their_own_winning_grant_token()
    {
        await using var server = await HealthyOpenShiftAsync();
        var readOnlyUser = _host.NewUsername();
        var readWriteUser = _host.NewUsername();
        var (cluster, readOnlyCredential) = await _host.Data.ProxyClusterAsync(server, readOnlyUser, AccessMode.ReadOnly);
        var readWriteCredential = await _host.Data.CredentialAsync(cluster.Name);
        await _host.Data.UserAsync(readWriteUser);
        await _host.Data.GrantAsync(readWriteUser, cluster.Name, readWriteCredential.Id, AccessMode.ReadWrite);
        readOnlyCredential.Token.ShouldNotBe(readWriteCredential.Token);

        using (var client = await _host.LoginAsAsync(readOnlyUser))
        {
            var line = (await StatusLinesAsync(client)).ShouldHaveSingleItem();
            line.GetProperty("cluster").GetProperty("accessMode").GetString().ShouldBe("readOnly");
        }

        ProbeAuthorizations(server).ShouldBe([$"Bearer {readOnlyCredential.Token}"]);

        using (var client = await _host.LoginAsAsync(readWriteUser))
        {
            var line = (await StatusLinesAsync(client)).ShouldHaveSingleItem();
            line.GetProperty("cluster").GetProperty("accessMode").GetString().ShouldBe("readWrite");
        }

        ProbeAuthorizations(server).ShouldBe([$"Bearer {readOnlyCredential.Token}", $"Bearer {readWriteCredential.Token}"], ignoreOrder: true);
        server.Requests.Where(IsProbe).Count().ShouldBe(6, "three OpenShift probes per credential, no more");
    }

    // Row 3 (FBE-4): U1 (credential X) and U2 (credential Y) on one cluster never share an entry; U1 again is served from
    // the cache; U3 sharing X shares U1's entry and costs no upstream probe.
    [Fact]
    public async Task Cache_entries_are_per_credential_never_per_cluster_and_shared_by_users_of_one_credential()
    {
        await using var server = await HealthyOpenShiftAsync();
        var u1 = _host.NewUsername();
        var u2 = _host.NewUsername();
        var u3 = _host.NewUsername();
        var (cluster, x) = await _host.Data.ProxyClusterAsync(server, u1, AccessMode.ReadOnly);
        var y = await _host.Data.CredentialAsync(cluster.Name);
        await _host.Data.UserAsync(u2);
        await _host.Data.GrantAsync(u2, cluster.Name, y.Id);
        await _host.Data.UserAsync(u3);
        await _host.Data.GrantAsync(u3, cluster.Name, x.Id);
        using var c1 = await _host.LoginAsAsync(u1);
        using var c2 = await _host.LoginAsAsync(u2);
        using var c3 = await _host.LoginAsAsync(u3);

        var first = (await StatusLinesAsync(c1)).ShouldHaveSingleItem();
        NodeTotal(first).ShouldBe(1);
        server.MapNodesTable("Ready", "Ready", "NotReady");

        var other = (await StatusLinesAsync(c2)).ShouldHaveSingleItem();
        NodeTotal(other).ShouldBe(3, "U2's credential has its own entry, so it sees the new node data");

        var probesWithX = ProbeCount(server, x.Token);
        var again = (await StatusLinesAsync(c1)).ShouldHaveSingleItem();
        NodeTotal(again).ShouldBe(1);
        again.GetProperty("checkedAt").GetString().ShouldBe(first.GetProperty("checkedAt").GetString());
        ProbeCount(server, x.Token).ShouldBe(probesWithX, "U1's second call within 30 s is a cache hit");

        var shared = (await StatusLinesAsync(c3)).ShouldHaveSingleItem();
        shared.GetProperty("checkedAt").GetString().ShouldBe(first.GetProperty("checkedAt").GetString());
        ProbeCount(server, x.Token).ShouldBe(probesWithX, "U3 shares credential X, so U1's probe serves it");
        ProbeCount(server, y.Token).ShouldBe(3);
    }

    // Row 4 (FBE-1, FBE-3): a cluster slower than the 1 s budget → timeout, a closed port → unreachable, a 401 →
    // tokenInvalid; the two healthy clusters still have full facts and the status is 200.
    [Fact]
    public async Task Timeout_unreachable_and_rejected_token_are_error_lines_next_to_full_facts()
    {
        var username = _host.NewUsername();
        await using var healthy = await HealthyOpenShiftAsync();
        await using var slow = await HealthyOpenShiftAsync();
        slow.Delay("GET", FakeKubeApiServer.NodesPath, TimeSpan.FromSeconds(4));
        await using var rejecting = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        foreach (var path in new[] { FakeKubeApiServer.ClusterVersionPath, FakeKubeApiServer.ClusterOperatorsPath, FakeKubeApiServer.NodesPath })
        {
            rejecting.Respond("GET", path, 401);
        }

        var (a, _) = await _host.Data.ProxyClusterAsync(healthy, username, AccessMode.ReadOnly);
        var (b, _) = await _host.Data.ProxyClusterAsync(healthy, username, AccessMode.ReadWrite);
        var (timedOut, _) = await _host.Data.ProxyClusterAsync(slow, username, AccessMode.ReadOnly);
        var (invalid, _) = await _host.Data.ProxyClusterAsync(rejecting, username, AccessMode.ReadOnly);
        var unreachable = await ClosedPortClusterAsync(username);
        using var client = await _host.LoginAsAsync(username);

        var started = Stopwatch.GetTimestamp();
        using var response = await client.GetAsync(FleetStatusEndpointTests.StatusUri, Ct);
        var elapsed = Stopwatch.GetElapsedTime(started);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var byName = ParseLines(await response.Content.ReadAsStringAsync(Ct)).ToDictionary(Name);
        byName.Keys.ShouldBe([a.Name, b.Name, timedOut.Name, invalid.Name, unreachable], ignoreOrder: true);
        Failure(byName[timedOut.Name]).ShouldBe("timeout");
        Failure(byName[unreachable]).ShouldBe("unreachable");
        Failure(byName[invalid.Name]).ShouldBe("tokenInvalid");
        foreach (var ok in new[] { a.Name, b.Name })
        {
            Failure(byName[ok]).ShouldBeNull();
            byName[ok].GetProperty("clusterVersion").GetProperty("outcome").GetString().ShouldBe("ok");
            byName[ok].GetProperty("clusterOperators").GetProperty("total").GetInt32().ShouldBe(1);
            NodeTotal(byName[ok]).ShouldBe(1);
        }

        foreach (var failed in new[] { timedOut.Name, invalid.Name, unreachable })
        {
            foreach (var section in new[] { "kubernetesVersion", "clusterVersion", "clusterOperators", "nodes" })
            {
                byName[failed].GetProperty(section).ValueKind.ShouldBe(JsonValueKind.Null);
            }
        }

        elapsed.ShouldBeLessThan(TimeSpan.FromSeconds(4), "the slow cluster is cut at the 1 s budget, not awaited");
    }

    // Row 5 (FBE-3): MaxClusterConcurrency 3 with 12 slow clusters → never more than 3 clusters probed at once upstream.
    [Fact]
    public async Task Never_more_than_MaxClusterConcurrency_clusters_are_probed_at_once()
    {
        var username = _host.NewUsername();
        await _host.Data.UserAsync(username);
        var gauge = new InFlightGauge();
        var servers = new List<FakeKubeApiServer>();
        try
        {
            for (var i = 0; i < 12; i++)
            {
                var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
                servers.Add(server);
                gauge.Serve(server, ClusterDistribution.Kubernetes, TimeSpan.FromMilliseconds(250));
                var cluster = await FakeClusterAsync(server, distribution: ClusterDistribution.Kubernetes);
                await _host.Data.GrantAsync(username, cluster.Name, (await _host.Data.CredentialAsync(cluster.Name)).Id);
            }

            using var client = await _host.LoginAsAsync(username);

            var lines = await StatusLinesAsync(client);

            lines.Count.ShouldBe(12);
            lines.ShouldAllBe(line => line.GetProperty("failure").ValueKind == JsonValueKind.Null);
            gauge.Max.ShouldBeLessThanOrEqualTo(3);
            gauge.Max.ShouldBe(3, "the bound is used, not just respected (12 clusters × 250 ms)");
        }
        finally
        {
            foreach (var server in servers)
            {
                await server.DisposeAsync();
            }
        }
    }

    // Row 6 (FBE-4): rotating the credential through the admin API drops its cached facts; the next call probes again
    // with the new token.
    [Fact]
    public async Task Rotating_the_credential_invalidates_its_cached_facts()
    {
        await using var server = await HealthyOpenShiftAsync();
        var username = _host.NewUsername();
        await _host.Data.UserAsync(username);
        var cluster = await FakeClusterAsync(server);
        using var admin = await _host.LoginAsAsync(_host.NewAdminUsername());
        var oldToken = CredentialApi.Opaque();
        var added = await CredentialApi.AddOkAsync(admin, cluster.Name, oldToken);
        var id = added.GetProperty("id").GetGuid();
        await _host.Data.GrantAsync(username, cluster.Name, new CredentialId(id));
        using var client = await _host.LoginAsAsync(username);

        var first = (await StatusLinesAsync(client)).ShouldHaveSingleItem();
        (await StatusLinesAsync(client)).ShouldHaveSingleItem().GetProperty("checkedAt").GetString()
            .ShouldBe(first.GetProperty("checkedAt").GetString(), "cached before the rotation");
        ProbeCount(server, oldToken).ShouldBe(3);

        var newToken = CredentialApi.Opaque();
        using (var rotated = await CredentialApi.RotateAsync(admin, cluster.Name, id, newToken, added.GetProperty("version").GetUInt32()))
        {
            rotated.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        var after = (await StatusLinesAsync(client)).ShouldHaveSingleItem();

        ProbeCount(server, newToken).ShouldBe(3, "the next call probed again, with the rotated token");
        ProbeCount(server, oldToken).ShouldBe(3);
        Failure(after).ShouldBeNull();
    }

    // FBE-3: the browser going away mid-stream aborts the upstream probe request (no orphaned work on the cluster). On the
    // shared host (5 s budget), so an abort well inside the budget can only have come from the client going away.
    [Fact]
    public async Task Client_abort_cancels_the_upstream_probe()
    {
        var host = fixture.Default;
        var username = host.NewUsername();
        await using var server = await HealthyOpenShiftAsync();
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var aborted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        server.MapGet(FakeKubeApiServer.NodesPath, async context =>
        {
            entered.TrySetResult();
            try
            {
                await Task.Delay(Timeout.InfiniteTimeSpan, context.RequestAborted);
            }
            catch (OperationCanceledException)
            {
                aborted.TrySetResult();
            }
        });
        await host.Data.ProxyClusterAsync(server, username, AccessMode.ReadOnly);
        using var client = await host.LoginAsAsync(username);

        var response = await client.GetAsync(FleetStatusEndpointTests.StatusUri, HttpCompletionOption.ResponseHeadersRead, Ct)
            .WaitAsync(TimeSpan.FromSeconds(15), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(15), Ct);
        var started = Stopwatch.GetTimestamp();
        response.Dispose();
        client.CancelPendingRequests();

        await aborted.Task.WaitAsync(TimeSpan.FromSeconds(15), Ct);
        Stopwatch.GetElapsedTime(started).ShouldBeLessThan(TimeSpan.FromSeconds(3), "cancelled by the abort, not by the 5 s budget");
    }

    internal static List<JsonElement> ParseLines(string body) =>
        [.. body.Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(line => JsonDocument.Parse(line).RootElement)];

    internal static async Task<List<JsonElement>> StatusLinesAsync(HttpClient client)
    {
        using var response = await client.GetAsync(FleetStatusEndpointTests.StatusUri, Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return ParseLines(await response.Content.ReadAsStringAsync(Ct));
    }

    internal static string Name(JsonElement line) => line.GetProperty("cluster").GetProperty("name").GetString()!;

    internal static string? Failure(JsonElement line) => line.GetProperty("failure").GetString();

    private static int NodeTotal(JsonElement line) => line.GetProperty("nodes").GetProperty("total").GetInt32();

    private static bool IsProbe(RecordedRequest request) =>
        request.Path is FakeKubeApiServer.ClusterVersionPath or FakeKubeApiServer.ClusterOperatorsPath or FakeKubeApiServer.NodesPath;

    private static List<string?> ProbeAuthorizations(FakeKubeApiServer server) =>
        [.. server.Requests.Where(IsProbe).Select(r => r.Authorization).Distinct()];

    private static int ProbeCount(FakeKubeApiServer server, string token) =>
        server.Requests.Count(r => IsProbe(r) && r.Authorization == $"Bearer {token}");

    /// <summary>A fake OpenShift cluster with one healthy operator and one Ready node.</summary>
    internal static async Task<FakeKubeApiServer> HealthyOpenShiftAsync()
    {
        var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapClusterVersion("4.17.3", history: [("Completed", "4.17.3")]);
        server.MapClusterOperatorsTable(("True", "False", "False"));
        server.MapNodesTable("Ready");
        return server;
    }

    private Task<SeededCluster> FakeClusterAsync(
        FakeKubeApiServer server, bool isEnabled = true, ClusterDistribution distribution = ClusterDistribution.OpenShift) =>
        _host.Data.ClusterAsync(isEnabled: isEnabled, distribution: distribution, apiUrl: server.BaseAddress.ToString(), caBundlePem: server.CaBundlePem);

    // Stores the user's groups after login, as session revalidation would (see ProxyGroupGrantTests).
    private async Task SetGroupsAsync(string username, params string[] groups)
    {
        await using var scope = _host.Services.CreateSignedInScope(TestData.Actor);
        var user = await scope.ServiceProvider.GetRequiredService<IUserRepository>().GetByUsernameAsync(Username.Create(username).Value, Ct);
        user!.ReplaceGroups(groups);
        await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
    }

    private async Task<string> ClosedPortClusterAsync(string username)
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        var cluster = await _host.Data.ClusterAsync(apiUrl: $"https://127.0.0.1:{port}");
        await _host.Data.GrantAsync(username, cluster.Name, (await _host.Data.CredentialAsync(cluster.Name)).Id);
        return cluster.Name;
    }

    /// <summary>The class's variant: a 1 s cluster budget and at most 3 clusters probed at once per request.</summary>
    public sealed class Host(ApiFactory factory) : IAsyncLifetime
    {
        /// <summary>The variant.</summary>
        public ApiFactory Api { get; private set; } = null!;

        /// <summary>The shared host with default fleet options (5 s budget).</summary>
        public ApiFactory Default => factory;

        /// <inheritdoc />
        public async ValueTask InitializeAsync() =>
            Api = await factory.CreateVariantAsync(new Dictionary<string, string?>
            {
                ["Fleet:ClusterTimeout"] = "00:00:01",
                ["Fleet:MaxClusterConcurrency"] = "3",
            });

        /// <inheritdoc />
        public async ValueTask DisposeAsync() => await Api.DisposeAsync();
    }
}

/// <summary>
/// Counts how many fake clusters are being probed at the same moment (QG5C-1 row 5, QG5C-4): a cluster is "in flight"
/// while any of its probe requests is being handled. Requests are released <em>before</em> the answer is written, so
/// the gauge can only under-count (a slot is freed only after the client read every answer), never over-count.
/// </summary>
internal sealed class InFlightGauge
{
    private int _current;
    private int _max;

    /// <summary>The most clusters seen in flight at once.</summary>
    public int Max => Volatile.Read(ref _max);

    /// <summary>
    /// Answers every probe of <paramref name="server"/> (healthy facts for <paramref name="distribution"/>) after
    /// <paramref name="delay"/>, counting the cluster in flight meanwhile.
    /// </summary>
    public void Serve(FakeKubeApiServer server, ClusterDistribution distribution, TimeSpan delay)
    {
        var active = new StrongBox<int>();
        var bodies = new Dictionary<string, object>
        {
            [FakeKubeApiServer.NodesPath] = FakeKubeApiServer.Table(["Name", "Status"], [["node-0", "Ready"]]),
        };
        if (distribution == ClusterDistribution.Kubernetes)
        {
            bodies["/version"] = new { major = "1", minor = "31", gitVersion = "v1.31.4" };
        }
        else
        {
            bodies[FakeKubeApiServer.ClusterVersionPath] = new
            {
                apiVersion = "config.openshift.io/v1",
                kind = "ClusterVersion",
                metadata = new { name = "version" },
                status = new { desired = new { version = "4.17.3" }, conditions = Array.Empty<object>() },
            };
            bodies[FakeKubeApiServer.ClusterOperatorsPath] = FakeKubeApiServer.Table(
                ["Name", "Available", "Progressing", "Degraded"], [["operator-0", "True", "False", "False"]]);
        }

        foreach (var (path, body) in bodies)
        {
            var json = JsonSerializer.Serialize(body);
            server.MapGet(path, async context =>
            {
                if (Interlocked.Increment(ref active.Value) == 1)
                {
                    var now = Interlocked.Increment(ref _current);
                    int seen;
                    while (now > (seen = Volatile.Read(ref _max)) && Interlocked.CompareExchange(ref _max, now, seen) != seen)
                    {
                    }
                }

                try
                {
                    await Task.Delay(delay, context.RequestAborted);
                }
                finally
                {
                    if (Interlocked.Decrement(ref active.Value) == 0)
                    {
                        Interlocked.Decrement(ref _current);
                    }
                }

                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync(json, context.RequestAborted);
            });
        }
    }
}
