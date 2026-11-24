using System.Diagnostics;
using System.Net;
using FleetConsole.Infrastructure.Crypto;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;

namespace FleetConsole.Api.Tests.Integration.Hosting;

/// <summary>
/// PRB-1/PRB-2 (ADR-0028 §2): the kubelet probes work in Production without session or CSRF header, expose only the
/// status word, and separate liveness (no dependencies) from readiness (database).
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProductionProbeTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("GET", "/health")]
    [InlineData("GET", "/alive")]
    [InlineData("POST", "/health")]
    public async Task Probes_AreHealthy_Anonymous_WithoutCsrfHeader_StatusWordOnly(string method, string path)
    {
        await using var host = ProductionHost.Create(factory);
        using var client = host.CreateClient();
        using (await Readiness.GetWhenReadyAsync(client, "/health", Ct))
        {
            // The key-ring warm-up runs in the background right after start (T-0231).
        }

        using var request = new HttpRequestMessage(new HttpMethod(method), new Uri(path, UriKind.Relative));
        using var response = await client.SendAsync(request, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await response.Content.ReadAsStringAsync(Ct)).ShouldBe("Healthy");
    }

    /// <summary>
    /// PRB-2 / T-0106: with the database unreachable at start the host must not block on it (the Data Protection
    /// key-ring load used to wait ~60 s for EF's retries before Kestrel bound). <c>/alive</c> answers 200 well within
    /// the startup probe budget (60 s) and <c>/health</c> answers 503 within the readiness probe timeout (3 s).
    /// </summary>
    /// <param name="host">Refused: loopback port 1. Dropped: TEST-NET-1 (RFC 5737), never routed, so connects hang
    /// until the 15 s connect timeout (or fail at once where there is no route).</param>
    [Theory]
    [InlineData("127.0.0.1;Port=1")]
    [InlineData("192.0.2.1;Port=5432")]
    public async Task DatabaseUnreachable_AliveIs200Promptly_HealthIs503Promptly(string host)
    {
        await using var production = ProductionHost.Create(factory, new Dictionary<string, string?>
        {
            [$"ConnectionStrings:{ConsoleDbContext.ConnectionName}"] = $"Host={host};Database=x;Username=x;Password=fake",
        });

        var started = Stopwatch.StartNew();
        using var client = production.CreateClient(); // starts the host
        using var alive = await client.GetAsync(new Uri("/alive", UriKind.Relative), Ct);
        var aliveAfter = started.Elapsed;

        started.Restart();
        using var health = await client.GetAsync(new Uri("/health", UriKind.Relative), Ct);
        var healthAfter = started.Elapsed;

        alive.StatusCode.ShouldBe(HttpStatusCode.OK);
        aliveAfter.ShouldBeLessThan(TimeSpan.FromSeconds(15));
        health.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
        (await health.Content.ReadAsStringAsync(Ct)).ShouldBe("Unhealthy");
        healthAfter.ShouldBeLessThan(TimeSpan.FromSeconds(3));
    }

    /// <summary>
    /// PRB-2 / T-0106 / T-0231: a pod that started during an outage becomes ready once the database is back, without a
    /// restart — the key-ring warm-up's first attempt fails and a retry succeeds. The connection string is read per
    /// attempt and per context, so switching it at runtime stands in for the database coming back. A clock with short
    /// timers replaces the 2 s+ retry backoff (no real sleeps).
    /// </summary>
    [Fact]
    public async Task DatabaseBackAfterStart_KeyRingWarmupRetries_HealthRecovers_WithoutRestart()
    {
        var connectionKey = $"ConnectionStrings:{ConsoleDbContext.ConnectionName}";
        await using var production = ProductionHost.Create(
            factory,
            new Dictionary<string, string?> { [connectionKey] = "Host=127.0.0.1;Port=1;Database=x;Username=x;Password=fake" },
            services => services.AddSingleton<TimeProvider>(new ShortTimers()));
        using var client = production.CreateClient();
        using (var down = await client.GetAsync(new Uri("/health", UriKind.Relative), Ct))
        {
            down.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
        }

        production.Services.GetRequiredService<IConfiguration>()[connectionKey] = factory.ConnectionString;

        using var up = await Readiness.GetWhenReadyAsync(client, "/health", Ct);
        up.StatusCode.ShouldBe(HttpStatusCode.OK);
        production.Services.GetRequiredService<KeyRingWarmupState>().IsLoaded.ShouldBeTrue();
    }

    /// <summary>
    /// T-0231: readiness waits for the key ring. While another pod holds the key-ring lock (here: the test), the
    /// warm-up blocks, so <c>/health</c> is 503 although the database is up; <c>/alive</c> is 200 throughout. Releasing
    /// the lock lets the warm-up load the ring and the pod turns ready.
    /// </summary>
    [Fact]
    public async Task KeyRingLockHeldElsewhere_HealthIs503UntilTheRingIsLoaded_AliveIs200Throughout()
    {
        await using var lockHolder = await HoldKeyRingLockAsync();

        await using var production = ProductionHost.Create(factory);
        using var client = production.CreateClient();
        using (var health = await client.GetAsync(new Uri("/health", UriKind.Relative), Ct))
        {
            health.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
        }

        using (var alive = await client.GetAsync(new Uri("/alive", UriKind.Relative), Ct))
        {
            alive.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        production.Services.GetRequiredService<KeyRingWarmupState>().IsLoaded.ShouldBeFalse();

        await LockAsync(lockHolder, "pg_advisory_unlock");

        using var ready = await Readiness.GetWhenReadyAsync(client, "/health", Ct);
        ready.StatusCode.ShouldBe(HttpStatusCode.OK);
        using var stillAlive = await client.GetAsync(new Uri("/alive", UriKind.Relative), Ct);
        stillAlive.StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    /// <summary>T-0106: the framework's blocking start-time key-ring load is gone, replaced by the background warm-up.</summary>
    [Fact]
    public async Task KeyRingLoad_IsNotOnTheStartupPath()
    {
        await using var production = ProductionHost.Create(factory);

        var hostedServices = production.Services.GetServices<IHostedService>().Select(s => s.GetType().FullName).ToList();

        hostedServices.ShouldNotContain("Microsoft.AspNetCore.DataProtection.Internal.DataProtectionHostedService");
        hostedServices.ShouldContain("FleetConsole.Infrastructure.Crypto.KeyRingWarmupService");
    }

    /// <summary>
    /// T-0231 review: a waiter blocked by a lock whose holder never lets go (a vanished node) gives up after
    /// <c>lock_timeout</c>, logs the failed attempt and retries, and turns ready once the lock is free.
    /// </summary>
    [Fact]
    public async Task KeyRingLockNeverReleased_WaiterTimesOut_LogsAndRetries_ReadyAfterRelease()
    {
        await using var lockHolder = await HoldKeyRingLockAsync();
        var timeoutsBefore = LockTimeoutWarnings();

        await using var production = ProductionHost.Create(factory, configureServices: services =>
        {
            services.AddSingleton(new KeyRingWarmupOptions { LockTimeout = TimeSpan.FromMilliseconds(200) });
            services.AddSingleton<TimeProvider>(new ShortTimers());
        });
        using var client = production.CreateClient();

        var deadline = DateTimeOffset.UtcNow + Readiness.Timeout;
        while (LockTimeoutWarnings() == timeoutsBefore && DateTimeOffset.UtcNow < deadline)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(50), Ct);
        }

        LockTimeoutWarnings().ShouldBeGreaterThan(timeoutsBefore, "a blocked waiter must time out and log the attempt");
        using (var blocked = await client.GetAsync(new Uri("/health", UriKind.Relative), Ct))
        {
            blocked.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
        }

        await LockAsync(lockHolder, "pg_advisory_unlock");

        using var ready = await Readiness.GetWhenReadyAsync(client, "/health", Ct);
        ready.StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    /// <summary>Warm-up failures caused by <c>lock_timeout</c> (SQLSTATE 55P03) captured so far.</summary>
    private int LockTimeoutWarnings() =>
        factory.Logs.Entries.Count(entry => entry.EventId == KeyRingWarmupService.WarmupFailedEventId
            && entry.Text.Contains(PostgresErrorCodes.LockNotAvailable, StringComparison.Ordinal));

    /// <summary>
    /// Takes the key-ring lock as "another pod". Unpooled, so disposing the connection ends the session and releases the
    /// lock even when an assertion fails first (a pooled session would keep it and block every later host's warm-up).
    /// </summary>
    private async Task<NpgsqlConnection> HoldKeyRingLockAsync()
    {
        var connection = new NpgsqlConnection(
            new NpgsqlConnectionStringBuilder(factory.ConnectionString) { Pooling = false }.ConnectionString);
        await connection.OpenAsync(Ct);
        await LockAsync(connection, "pg_advisory_lock");
        return connection;
    }

    private static async Task LockAsync(NpgsqlConnection connection, string function)
    {
        await using var command = new NpgsqlCommand($"select {function}(@key)", connection);
        command.Parameters.AddWithValue("key", DataProtectionSetup.KeyRingLockKey);
        await command.ExecuteNonQueryAsync(Ct);
    }

    /// <summary>A clock whose timers fire after 20 ms whatever their due time, so retry backoffs pass at once.</summary>
    private sealed class ShortTimers : TimeProvider
    {
        private static readonly TimeSpan Short = TimeSpan.FromMilliseconds(20);

        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period) =>
            System.CreateTimer(
                callback,
                state,
                dueTime == Timeout.InfiniteTimeSpan ? dueTime : Short,
                period == Timeout.InfiniteTimeSpan || period == TimeSpan.Zero ? period : Short);
    }
}
