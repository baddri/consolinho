using System.Net;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Domain.Clusters;
using FleetConsole.Infrastructure.Kubernetes;

namespace FleetConsole.Api.Tests.Kubernetes;

/// <summary>
/// <see cref="ClusterForwardingClientPool"/> against <see cref="FakeKubeApiServer"/> with real TLS: value-keyed reuse and
/// rebuild (PRX-7 "next request uses the new settings"), per-cluster trust isolation, unusable CA bundles, and disposal
/// of retired handlers on a fake clock. No database or container needed.
/// </summary>
public sealed class ClusterForwardingClientPoolTests : IDisposable
{
    /// <summary>Unique text inside the corrupt CA bundle; finding it in a log means CA content leaked.</summary>
    private const string CorruptCaMarker = "corrupt-ca-T0058-must-not-be-logged";

    private readonly RecordingLogger<ClusterForwardingClientPool> _logger = new();
    private readonly TimerTimeProvider _time = new();
    private readonly ClusterForwardingClientPool _pool;

    public ClusterForwardingClientPoolTests() => _pool = new(new ClusterTlsHandlerFactory(), _time, _logger);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public void Dispose() => _pool.Dispose();

    private static ClusterId NewClusterId() => new(Guid.NewGuid());

    private static ClusterConnection Trusting(FakeKubeApiServer server) =>
        new(server.BaseAddress, server.CaBundlePem, SkipTlsVerify: false);

    private HttpMessageInvoker Get(ClusterId clusterId, ClusterConnection connection)
    {
        _pool.TryGetInvoker(clusterId, connection, out var invoker).ShouldBeTrue();
        return invoker;
    }

    private static async Task<HttpStatusCode> GetVersionAsync(HttpMessageInvoker invoker, FakeKubeApiServer server)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(server.BaseAddress, "version"));
        using var response = await invoker.SendAsync(request, Ct);
        return response.StatusCode;
    }

    // ---- unusable CA bundle --------------------------------------------------------------------------------------

    [Fact]
    public async Task CorruptCaBundle_ReturnsFalse_LogsWarningWithoutCaText_AndCachesNothing()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion();
        var clusterId = NewClusterId();
        var corrupt = new ClusterConnection(server.BaseAddress, $"not a pem bundle {CorruptCaMarker}", SkipTlsVerify: false);

        _pool.TryGetInvoker(clusterId, corrupt, out var invoker).ShouldBeFalse();
        invoker.ShouldBeNull();
        _pool.TryGetInvoker(clusterId, corrupt, out _).ShouldBeFalse();

        _logger.Entries.Count.ShouldBe(2);
        _logger.Entries.ShouldAllBe(entry => entry.StartsWith("Warning", StringComparison.Ordinal));
        _logger.AllText.ShouldContain(clusterId.Value.ToString());
        _logger.AllText.ShouldNotContain(CorruptCaMarker);

        // The admin fixes the bundle: the next request just works.
        (await GetVersionAsync(Get(clusterId, Trusting(server)), server)).ShouldBe(HttpStatusCode.OK);
    }

    // ---- value-keyed reuse and rebuild ---------------------------------------------------------------------------

    [Fact]
    public async Task EqualConnection_ReturnsSameInvoker()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var clusterId = NewClusterId();

        var first = Get(clusterId, Trusting(server));
        var second = Get(clusterId, Trusting(server)); // a new, value-equal record — as loaded per request

        second.ShouldBeSameAs(first);
        _logger.Entries.ShouldBeEmpty();
    }

    [Fact]
    public async Task ChangedUrlCaOrSkipFlag_EachBuildsNewInvoker_AndLogsRebuildWithoutUrl()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        await using var other = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var clusterId = NewClusterId();
        var original = Trusting(server);

        var initial = Get(clusterId, original);
        var newUrl = Get(clusterId, original with { ApiUrl = new Uri(server.BaseAddress, "prefix/") });
        var newCa = Get(clusterId, original with { CaBundlePem = other.CaBundlePem });
        var skip = Get(clusterId, original with { SkipTlsVerify = true });

        new[] { initial, newUrl, newCa, skip }.Distinct().Count().ShouldBe(4);
        _logger.Entries.Count.ShouldBe(3);
        _logger.Entries.ShouldAllBe(entry => entry.StartsWith("Information", StringComparison.Ordinal));
        _logger.AllText.ShouldContain($"Rebuilt forwarding client for cluster {clusterId.Value}");
        _logger.AllText.ShouldNotContain(server.BaseAddress.Authority);
        _logger.AllText.ShouldNotContain("BEGIN CERTIFICATE");
    }

    [Fact]
    public async Task ConcurrentFirstRequests_BuildOneInvoker()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var clusterId = NewClusterId();

        var invokers = await Task.WhenAll(Enumerable.Range(0, 16).Select(_ => Task.Run(() => Get(clusterId, Trusting(server)), Ct)));

        invokers.Distinct().ShouldHaveSingleItem();
    }

    // ---- per-cluster trust isolation (PRX-7) ---------------------------------------------------------------------

    [Fact]
    public async Task EachClusterTrustsOnlyItsOwnCa_AndSkipTlsAppliesOnlyWhereSet()
    {
        await using var serverA = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        await using var serverB = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        serverA.MapVersion();
        serverB.MapVersion();

        var clusterA = Get(NewClusterId(), Trusting(serverA));
        var clusterB = Get(NewClusterId(), Trusting(serverB));
        var skipping = Get(NewClusterId(), new ClusterConnection(serverB.BaseAddress, CaBundlePem: null, SkipTlsVerify: true));
        var systemStore = Get(NewClusterId(), new ClusterConnection(serverB.BaseAddress, CaBundlePem: null, SkipTlsVerify: false));

        (await GetVersionAsync(clusterA, serverA)).ShouldBe(HttpStatusCode.OK);
        (await GetVersionAsync(clusterB, serverB)).ShouldBe(HttpStatusCode.OK);
        (await GetVersionAsync(skipping, serverB)).ShouldBe(HttpStatusCode.OK);

        // A's invoker pointed at B's server: B's certificate is not issued by A's CA.
        var crossed = await Should.ThrowAsync<HttpRequestException>(() => GetVersionAsync(clusterA, serverB));
        crossed.HttpRequestError.ShouldBe(HttpRequestError.SecureConnectionError);

        // No CA and no skip flag: the system store doesn't know the test CA, so skip-TLS on another cluster didn't leak.
        var untrusted = await Should.ThrowAsync<HttpRequestException>(() => GetVersionAsync(systemStore, serverB));
        untrusted.HttpRequestError.ShouldBe(HttpRequestError.SecureConnectionError);
    }

    // ---- disposal ------------------------------------------------------------------------------------------------

    [Fact]
    public async Task RetiredInvoker_StaysUsableDuringGracePeriod_ThenIsDisposed()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion();
        var clusterId = NewClusterId();
        var retired = Get(clusterId, Trusting(server));
        var current = Get(clusterId, Trusting(server) with { SkipTlsVerify = true });

        _time.Advance(ClusterForwardingClientPool.DefaultRetiredHandlerGracePeriod - TimeSpan.FromSeconds(1));
        (await GetVersionAsync(retired, server)).ShouldBe(HttpStatusCode.OK);

        _time.Advance(TimeSpan.FromSeconds(1));
        await Should.ThrowAsync<ObjectDisposedException>(() => GetVersionAsync(retired, server));
        (await GetVersionAsync(current, server)).ShouldBe(HttpStatusCode.OK);
        _time.ActiveTimers.ShouldBe(0);
    }

    [Fact]
    public async Task Dispose_DisposesCurrentAndRetiredInvokers_AndCancelsTimers()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var clusterId = NewClusterId();
        var retired = Get(clusterId, Trusting(server));
        var current = Get(clusterId, Trusting(server) with { SkipTlsVerify = true });
        var otherCluster = Get(NewClusterId(), Trusting(server));

        _pool.Dispose();

        foreach (var invoker in new[] { retired, current, otherCluster })
        {
            await Should.ThrowAsync<ObjectDisposedException>(() => GetVersionAsync(invoker, server));
        }

        _time.ActiveTimers.ShouldBe(0);
        Should.Throw<ObjectDisposedException>(() => _pool.TryGetInvoker(clusterId, Trusting(server), out _));
    }
}

/// <summary>
/// A <see cref="TimeProvider"/> whose clock and one-shot timers only move when the test calls <see cref="Advance"/>.
/// Supports exactly what the pool uses: <see cref="ITimer.Change"/> with an infinite period, and dispose.
/// </summary>
internal sealed class TimerTimeProvider : TimeProvider
{
    private readonly Lock _lock = new();
    private readonly List<FakeTimer> _timers = [];
    private DateTimeOffset _now = new(2026, 11, 20, 9, 0, 0, TimeSpan.Zero);

    /// <summary>Timers that are armed and not yet fired or disposed.</summary>
    public int ActiveTimers
    {
        get
        {
            lock (_lock)
            {
                return _timers.Count(timer => timer.DueAt is not null);
            }
        }
    }

    /// <inheritdoc />
    public override DateTimeOffset GetUtcNow()
    {
        lock (_lock)
        {
            return _now;
        }
    }

    /// <inheritdoc />
    public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
    {
        var timer = new FakeTimer(this, callback, state);
        lock (_lock)
        {
            _timers.Add(timer);
        }

        timer.Change(dueTime, period);
        return timer;
    }

    /// <summary>Moves the clock forward and fires (synchronously) every timer that came due.</summary>
    /// <param name="by">How far.</param>
    public void Advance(TimeSpan by)
    {
        List<FakeTimer> due;
        lock (_lock)
        {
            _now += by;
            due = [.. _timers.Where(timer => timer.DueAt <= _now)];
            foreach (var timer in due)
            {
                timer.DueAt = null; // one-shot
            }
        }

        foreach (var timer in due)
        {
            timer.Fire();
        }
    }

    private void Remove(FakeTimer timer)
    {
        lock (_lock)
        {
            _timers.Remove(timer);
        }
    }

    private sealed class FakeTimer(TimerTimeProvider owner, TimerCallback callback, object? state) : ITimer
    {
        public DateTimeOffset? DueAt { get; set; }

        public bool Change(TimeSpan dueTime, TimeSpan period)
        {
            lock (owner._lock)
            {
                DueAt = dueTime == Timeout.InfiniteTimeSpan ? null : owner._now + dueTime;
            }

            return true;
        }

        public void Fire() => callback(state);

        public void Dispose() => owner.Remove(this);

        public ValueTask DisposeAsync()
        {
            Dispose();
            return ValueTask.CompletedTask;
        }
    }
}
