using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using FleetConsole.Api.Http;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Api.Tests.Integration;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using FleetConsole.Api.Tests.Integration.Admin.Grants;
using FleetConsole.Api.Tests.Integration.Hosting;
using FleetConsole.Api.Tests.Integration.Proxy;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Infrastructure;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace FleetConsole.Api.Tests.Caching;

/// <summary>
/// The access cache when a dependency fails, end to end through the proxy. CACHE-5 (fail-safe off): once the cached
/// snapshot expires while the database is unreachable, the request answers 503 <c>Persistence.Unavailable</c> and never
/// the stale entry. CACHE-7: with Redis down, login and proxying keep working from L1 + database, <c>/health</c> is
/// 200 Degraded, a warning is logged, and a revoke still takes effect at once (access is never widened).
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class AccessCacheFailureTests(ApiFactory factory)
{
    private const string Pods = "/api/v1/namespaces/shop/pods";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Expired_entry_with_the_database_unreachable_answers_503_never_the_stale_snapshot()
    {
        await using var host = await factory.CreateVariantAsync(new Dictionary<string, string?>
        {
            ["ConnectionStrings:redis"] = factory.Redis.ConnectionString, // L2 holds a copy too, as in production
            ["Cache:Duration"] = "00:00:03",
            ["Aspire:Npgsql:EntityFrameworkCore:PostgreSQL:DisableRetry"] = "true",
        });
        await using var server = await StartServerAsync();
        var username = host.NewUsername();
        var (cluster, _) = await host.Data.ProxyClusterAsync(server, username, AccessMode.ReadOnly);
        using var client = await ProxyTestClient.LoginAsync(host, username);
        (await StatusAsync(client, cluster.Name)).ShouldBe(HttpStatusCode.OK);
        var warmed = Stopwatch.StartNew();

        host.Services.GetRequiredService<IConfiguration>()[$"ConnectionStrings:{ConsoleDbContext.ConnectionName}"] =
            new NpgsqlConnectionStringBuilder(host.ConnectionString) { Port = ClosedPort() }.ConnectionString;

        // While the entry is fresh the request needs no database at all (proves the 503 below comes from the expiry).
        (await StatusAsync(client, cluster.Name)).ShouldBe(HttpStatusCode.OK);
        warmed.Elapsed.ShouldBeLessThan(TimeSpan.FromSeconds(3), "the fresh-entry check ran too late to mean anything");

        await Task.Delay(TimeSpan.FromSeconds(3.5) - warmed.Elapsed, Ct);
        var forwardedBefore = server.Requests.Count;
        for (var attempt = 0; attempt < 3; attempt++)
        {
            using var response = await client.SendAsync(HttpMethod.Get, cluster.Name, Pods);
            var body = await response.Content.ReadAsStringAsync(Ct);
            response.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable, body);
            response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
            body.ShouldContain($"\"{ResultExtensions.ErrorCodeExtension}\":\"{PersistenceErrors.UnavailableCode}\"");
        }

        server.Requests.Count.ShouldBe(forwardedBefore, "nothing was forwarded on the stale snapshot");
    }

    [Fact]
    public async Task Redis_down_keeps_login_and_proxy_working_reports_degraded_and_never_widens_access()
    {
        await using var redis = new RedisFixture();
        await redis.StartAsync(Ct);
        await using var host = await factory.CreateVariantAsync(new Dictionary<string, string?>
        {
            ["ConnectionStrings:redis"] = redis.ConnectionString,
        });
        await using var server = await StartServerAsync();
        var warmUser = host.NewUsername();
        var (warmCluster, _) = await host.Data.ProxyClusterAsync(server, warmUser, AccessMode.ReadOnly);
        using var warm = await ProxyTestClient.LoginAsync(host, warmUser);
        (await StatusAsync(warm, warmCluster.Name)).ShouldBe(HttpStatusCode.OK);

        await redis.StopAsync(Ct);

        // Cached user: served from L1.
        (await StatusAsync(warm, warmCluster.Name)).ShouldBe(HttpStatusCode.OK);

        // New user: login and a cache miss load from the database although L2 is gone.
        var coldUser = host.NewUsername();
        var (coldCluster, _) = await host.Data.ProxyClusterAsync(server, coldUser, AccessMode.ReadOnly);
        using var cold = await ProxyTestClient.LoginAsync(host, coldUser);
        (await StatusAsync(cold, coldCluster.Name)).ShouldBe(HttpStatusCode.OK);

        // Never widened: a revoke committed while Redis is down is refused on the next request of this instance.
        using var admin = await host.AdminClientAsync();
        var grant = (await GrantsApi.UserGrantsAsync(admin, warmUser)).Single();
        using (var revoke = await GrantsApi.RevokeAsync(admin, grant.GetProperty("id").GetGuid()))
        {
            revoke.IsSuccessStatusCode.ShouldBeTrue();
        }

        (await StatusAsync(warm, warmCluster.Name)).ShouldBe(HttpStatusCode.NotFound);

        var report = await host.Services.GetRequiredService<HealthCheckService>().CheckHealthAsync(Ct);
        report.Entries[DependencyInjection.RedisHealthCheckName].Status.ShouldBe(HealthStatus.Degraded);
        using var probe = host.CreateClient();
        using var health = await Readiness.GetWhenReadyAsync(probe, "/health", Ct);
        health.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await health.Content.ReadAsStringAsync(Ct)).ShouldBe("Degraded");
        host.Logs.Entries.ShouldContain(e => e.Level == LogLevel.Warning
            && (e.Text.Contains("FusionCache", StringComparison.Ordinal) || e.Text.Contains("Redis", StringComparison.Ordinal)));
    }

    private static async Task<HttpStatusCode> StatusAsync(ProxyTestClient client, string cluster)
    {
        using var response = await client.SendAsync(HttpMethod.Get, cluster, Pods);
        return response.StatusCode;
    }

    private static async Task<FakeKubeApiServer> StartServerAsync()
    {
        var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", Pods, 200, new { kind = "PodList", items = Array.Empty<object>() });
        return server;
    }

    // A loopback port nothing listens on (bound once, then released), so connecting is refused at once.
    private static int ClosedPort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        return ((IPEndPoint)listener.LocalEndpoint).Port;
    }
}
