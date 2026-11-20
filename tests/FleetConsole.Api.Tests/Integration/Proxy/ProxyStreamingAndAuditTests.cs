using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Application.Audit;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Api.Tests.Integration.Proxy;

/// <summary>
/// PRX-8 (watch events are streamed, not buffered, and reach the client within 1 s) and PAUD-3 (the audit entry of a
/// mutation records what happened even when the client leaves or the cluster is unreachable, and a failing audit write
/// never changes the response). TestServer streams response bodies through a pipe, so it is enough here; the
/// Kestrel-only cases are in <see cref="ProxyKestrelTests"/>.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProxyStreamingAndAuditTests(ApiFactory factory)
{
    private const string Pods = "/api/v1/namespaces/shop/pods";
    private const string ConfigMap = "/api/v1/namespaces/shop/configmaps/web";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Watch_Events_Reach_The_Client_Within_A_Second_While_The_Stream_Stays_Open()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var watch = server.MapWatch(Pods);
        var username = factory.NewUsername();
        var (cluster, _) = await factory.Data.ProxyClusterAsync(server, username, AccessMode.ReadOnly);
        using var client = await ProxyTestClient.LoginAsync(factory, username);

        var sending = client.SendAsync(HttpMethod.Get, cluster.Name, Pods + "?watch=1&timeoutSeconds=60",
            completion: HttpCompletionOption.ResponseHeadersRead);
        await AssertEventsStreamAsync(sending, watch);
    }

    /// <summary>
    /// Sends three events through <paramref name="watch"/> one at a time and asserts each is read by the client within
    /// 1 s of <see cref="WatchStream.SendAsync"/> while the upstream response is still open (PRX-8), then that closing
    /// it ends the client's stream. The response headers are awaited after the first event is sent (T-0090: the proxy
    /// sends them only with the first body bytes).
    /// </summary>
    /// <param name="sending">The watch request, sent with <see cref="HttpCompletionOption.ResponseHeadersRead"/>.</param>
    /// <param name="watch">The fake's watch the request is attached to.</param>
    /// <returns>A task that completes when the assertions are done.</returns>
    internal static async Task AssertEventsStreamAsync(Task<HttpResponseMessage> sending, WatchStream watch)
    {
        await watch.Connected.WaitAsync(TimeSpan.FromSeconds(10), Ct);
        HttpResponseMessage? response = null;
        StreamReader? reader = null;
        try
        {
            foreach (var name in new[] { "web-1", "web-2", "web-3" })
            {
                var clock = Stopwatch.StartNew();
                await watch.SendAsync("ADDED", new { kind = "Pod", metadata = new { name } }, Ct);
                if (reader is null)
                {
                    response = await sending.WaitAsync(TimeSpan.FromSeconds(10), Ct);
                    response.StatusCode.ShouldBe(HttpStatusCode.OK);
                    reader = new StreamReader(await response.Content.ReadAsStreamAsync(Ct));
                }

                var line = await reader.ReadLineAsync(Ct).AsTask().WaitAsync(TimeSpan.FromSeconds(10), Ct);
                clock.Stop();

                line.ShouldNotBeNull().ShouldContain(name);
                clock.Elapsed.ShouldBeLessThan(TimeSpan.FromSeconds(1), $"event {name} latency");
            }

            // Every event above arrived while the upstream response was still open: nothing waited for the end.
            await watch.CloseAsync();
            (await reader!.ReadLineAsync(Ct).AsTask().WaitAsync(TimeSpan.FromSeconds(10), Ct)).ShouldBeNull();
        }
        finally
        {
            reader?.Dispose();
            response?.Dispose();
        }
    }

    [Fact]
    public async Task Client_Leaving_During_A_Put_Is_Audited_With_Status_0()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Delay("PUT", ConfigMap, TimeSpan.FromSeconds(30));
        var username = factory.NewUsername();
        var (cluster, _) = await factory.Data.ProxyClusterAsync(server, username, AccessMode.ReadWrite);
        using var client = await ProxyTestClient.LoginAsync(factory, username);

        using var leave = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        using var request = new HttpRequestMessage(HttpMethod.Put, ProxyTestClient.RawUri($"/api/clusters/{cluster.Name}/k8s{ConfigMap}"))
        {
            Content = Json("{\"kind\":\"ConfigMap\"}"),
        };
        var sending = client.Http.SendAsync(request, leave.Token);
        await WaitUntilAsync(() => server.Requests.Any(r => r.Method == "PUT"), "the PUT reached the cluster");
        await leave.CancelAsync();
        await Should.ThrowAsync<OperationCanceledException>(() => sending);

        var entry = await SingleProxyEntryAsync(factory, username);
        entry.Action.ShouldBe("proxy.update");
        Details(entry).GetProperty("statusCode").GetInt32().ShouldBe(0);
        Details(entry).GetProperty("outcome").GetString().ShouldBe("allowed");
    }

    [Fact]
    public async Task Put_To_An_Unreachable_Cluster_Is_Audited_With_Status_502()
    {
        var stopped = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var username = factory.NewUsername();
        var (cluster, _) = await factory.Data.ProxyClusterAsync(stopped, username, AccessMode.ReadWrite);
        await stopped.DisposeAsync();
        using var client = await ProxyTestClient.LoginAsync(factory, username);

        using var response = await client.SendAsync(HttpMethod.Put, cluster.Name, ConfigMap, Json("{}"));
        response.StatusCode.ShouldBe(HttpStatusCode.BadGateway);

        var entry = await SingleProxyEntryAsync(factory, username);
        Details(entry).GetProperty("statusCode").GetInt32().ShouldBe(502);
        Details(entry).GetProperty("outcome").GetString().ShouldBe("allowed");
    }

    [Fact]
    public async Task Failing_Audit_Write_Leaves_The_Response_Unchanged_And_Logs_Error_2400()
    {
        await using var variant = await factory.CreateVariantAsync(
            new Dictionary<string, string?>(),
            configureServices: ProxyAuditFails);
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("PUT", ConfigMap, 200, new { kind = "ConfigMap", metadata = new { name = "web" } });
        var username = variant.NewUsername();
        var (cluster, _) = await variant.Data.ProxyClusterAsync(server, username, AccessMode.ReadWrite);
        using var client = await ProxyTestClient.LoginAsync(variant, username);

        using var allowed = await client.SendAsync(HttpMethod.Put, cluster.Name, ConfigMap, Json("{}"));
        allowed.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await allowed.Content.ReadAsStringAsync(Ct)).ShouldContain("\"ConfigMap\"");

        // A denial's audit write fails too; the 403 still stands.
        await variant.Data.SetReadOnlyAsync(username, isReadOnly: true);
        using var readOnly = await ProxyTestClient.LoginAsync(variant, username);
        using var denied = await readOnly.SendAsync(HttpMethod.Put, cluster.Name, ConfigMap, Json("{}"));
        denied.StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        var failures = variant.Logs.Entries.Where(e => e.EventId == 2400).ToList();
        failures.Count.ShouldBe(2);
        failures.ShouldAllBe(e => e.Level == LogLevel.Error);
        (await variant.Data.AuditEntriesAsync(username)).ShouldNotContain(e => e.Category == AuditCategory.Proxy);
    }

    // Replaces IAuditTrail with a decorator that throws for proxy entries only (seeding and login still audit normally).
    private static void ProxyAuditFails(IServiceCollection services)
    {
        var original = services.Last(d => d.ServiceType == typeof(IAuditTrail));
        services.Remove(original);
        services.Add(ServiceDescriptor.Describe(
            typeof(IAuditTrail),
            provider => new ProxyFailingAuditTrail((IAuditTrail)ActivatorUtilities.CreateInstance(provider, original.ImplementationType!)),
            original.Lifetime));
    }

    internal static async Task<AuditEntry> SingleProxyEntryAsync(ApiFactory host, string username)
    {
        // The entry is written after the forwarder returns, which can be just after the client saw the response.
        List<AuditEntry> entries = [];
        await WaitUntilAsync(
            async () => (entries = [.. (await host.Data.AuditEntriesAsync(username)).Where(e => e.Category == AuditCategory.Proxy)]).Count > 0,
            "a proxy audit entry was written");
        return entries.ShouldHaveSingleItem();
    }

    internal static JsonElement Details(AuditEntry entry) => JsonDocument.Parse(entry.DetailsJson).RootElement.Clone();

    internal static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    internal static Task WaitUntilAsync(Func<bool> condition, string what) => WaitUntilAsync(() => Task.FromResult(condition()), what);

    internal static async Task WaitUntilAsync(Func<Task<bool>> condition, string what)
    {
        var deadline = Stopwatch.StartNew();
        while (!await condition())
        {
            deadline.Elapsed.ShouldBeLessThan(TimeSpan.FromSeconds(15), $"timed out waiting until {what}");
            await Task.Delay(50, Ct);
        }
    }

    private sealed class ProxyFailingAuditTrail(IAuditTrail inner) : IAuditTrail
    {
        public void Record(AuditRecord record)
        {
            if (record.Action.StartsWith("proxy.", StringComparison.Ordinal))
            {
                throw new InvalidOperationException("Simulated audit store failure (test).");
            }

            inner.Record(record);
        }
    }
}
