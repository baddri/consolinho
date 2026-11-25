using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Access;
using FleetConsole.Application.Access.LoadAccessSnapshot;
using FleetConsole.Application.Fleet;
using FleetConsole.Application.Fleet.GetFleetStatus;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Logging.Testing;
using Microsoft.Extensions.Options;
using NSubstitute;
using Shouldly;

namespace FleetConsole.Application.Tests.Fleet.GetFleetStatus;

/// <summary>
/// T-0321: the fleet stream resolves access once, probes with bounded parallelism, yields in completion order, isolates
/// a failing cluster and never lets a probe outlive the request.
/// </summary>
public sealed class GetFleetStatusHandlerTests
{
    private static readonly UserId Alice = new(Guid.Parse("0193a000-0000-7000-8000-0000000000a1"));
    private static readonly DateTimeOffset Now = new(2026, 11, 25, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ProbedAt = Now.AddSeconds(-12);

    private readonly IDispatcher _dispatcher = Substitute.For<IDispatcher>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly IClock _clock = Substitute.For<IClock>();
    private readonly FakeLogger<GetFleetStatusHandler> _logger = new();

    public GetFleetStatusHandlerTests()
    {
        _currentUser.UserId.Returns(Alice);
        _clock.UtcNow.Returns(Now);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Yields_lines_in_completion_order()
    {
        var a = new TaskCompletionSource<ClusterHealthFacts>(TaskCreationOptions.RunContinuationsAsynchronously);
        var b = new TaskCompletionSource<ClusterHealthFacts>(TaskCreationOptions.RunContinuationsAsynchronously);
        GivenClusters("cluster-a", "cluster-b");
        var stream = await HandleAsync(new FakeProbe((access, _) => access.ClusterName.Value == "cluster-a" ? a.Task : b.Task));

        await using var lines = stream.ReadAllAsync(Ct).GetAsyncEnumerator(Ct);
        var first = lines.MoveNextAsync();
        b.SetResult(Healthy());
        (await first).ShouldBeTrue();
        lines.Current.Cluster.Name.ShouldBe("cluster-b");

        var second = lines.MoveNextAsync();
        a.SetResult(Healthy());
        (await second).ShouldBeTrue();
        lines.Current.Cluster.Name.ShouldBe("cluster-a");
        (await lines.MoveNextAsync()).ShouldBeFalse();
    }

    [Fact]
    public async Task Never_probes_more_clusters_at_once_than_MaxClusterConcurrency()
    {
        GivenClusters([.. Enumerable.Range(0, 25).Select(i => $"cluster-{i:00}")]);
        var inFlight = 0;
        var maxSeen = 0;
        var probe = new FakeProbe(async (_, ct) =>
        {
            var now = Interlocked.Increment(ref inFlight);
            InterlockedMax(ref maxSeen, now);
            await Task.Delay(10, ct);
            Interlocked.Decrement(ref inFlight);
            return Healthy();
        });
        var stream = await HandleAsync(probe, maxClusterConcurrency: 3);

        var lines = await ReadAllAsync(stream);

        lines.Count.ShouldBe(25);
        lines.Select(l => l.Cluster.Name).Distinct().Count().ShouldBe(25);
        maxSeen.ShouldBeInRange(1, 3);
    }

    [Fact]
    public async Task A_throwing_cluster_becomes_an_upstreamError_line_and_the_others_continue()
    {
        GivenClusters("cluster-a", "cluster-b", "cluster-c");
        var stream = await HandleAsync(new FakeProbe((access, _) => access.ClusterName.Value == "cluster-b"
            ? throw new InvalidOperationException("probe bug")
            : Task.FromResult(Healthy())));

        var lines = await ReadAllAsync(stream);

        lines.Count.ShouldBe(3);
        var failed = lines.Single(l => l.Cluster.Name == "cluster-b");
        failed.Failure.ShouldBe(FleetClusterFailure.UpstreamError);
        failed.CheckedAt.ShouldBe(Now);
        failed.Nodes.ShouldBeNull();
        lines.Where(l => l.Cluster.Name != "cluster-b").ShouldAllBe(l => l.Failure == null && l.CheckedAt == ProbedAt);
        var log = _logger.Collector.GetSnapshot().ShouldHaveSingleItem();
        log.Level.ShouldBe(LogLevel.Error);
        log.Exception.ShouldBeOfType<InvalidOperationException>();
    }

    [Fact]
    public async Task Cancelling_the_consumer_token_cancels_in_flight_probes_and_ends_the_enumeration()
    {
        GivenClusters("cluster-a", "cluster-b");
        var probe = FakeProbe.Hanging(expectedCalls: 2);
        var stream = await HandleAsync(probe);
        using var request = CancellationTokenSource.CreateLinkedTokenSource(Ct);

        var reading = ReadAllAsync(stream, request.Token);
        await probe.AllStarted.WaitAsync(Ct);
        await request.CancelAsync();

        await Should.ThrowAsync<OperationCanceledException>(reading);
        probe.CancellationsObserved.ShouldBe(2);
        _logger.Collector.Count.ShouldBe(0);
    }

    [Fact]
    public async Task Stopping_early_cancels_the_probes_still_in_flight()
    {
        GivenClusters("cluster-a", "cluster-b");
        var probe = FakeProbe.Hanging(expectedCalls: 2, completes: "cluster-a");
        var stream = await HandleAsync(probe);

        var lines = stream.ReadAllAsync(Ct).GetAsyncEnumerator(Ct);
        (await lines.MoveNextAsync()).ShouldBeTrue();
        lines.Current.Cluster.Name.ShouldBe("cluster-a");
        await probe.AllStarted.WaitAsync(Ct);

        // The client is gone: disposing awaits the producer, so the hanging probe has already observed cancellation.
        await lines.DisposeAsync();

        probe.CancellationsObserved.ShouldBe(1);
    }

    [Fact]
    public async Task No_access_yields_an_empty_stream_and_resolves_access_once()
    {
        GivenClusters();
        var probe = new FakeProbe((_, _) => throw new InvalidOperationException("must not probe"));

        var stream = await HandleAsync(probe);

        stream.ClusterCount.ShouldBe(0);
        (await ReadAllAsync(stream)).ShouldBeEmpty();
        await _dispatcher.Received(1).Send(Arg.Any<IRequest<Result<AccessSnapshot>>>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Access_is_resolved_once_per_query_and_lines_carry_the_current_identity_and_mode()
    {
        GivenClusters("cluster-a", "cluster-b");
        _currentUser.IsReadOnly.Returns(true);
        var probe = new FakeProbe((_, _) => Task.FromResult(Healthy()));

        var stream = await HandleAsync(probe);
        var lines = await ReadAllAsync(stream);

        stream.ClusterCount.ShouldBe(2);
        lines.Count.ShouldBe(2);
        await _dispatcher.Received(1).Send(Arg.Any<IRequest<Result<AccessSnapshot>>>(), Arg.Any<CancellationToken>());
        lines.ShouldAllBe(l => l.Cluster.AccessMode == AccessMode.ReadOnly && l.Cluster.DisplayName == "Display");
        probe.SessionReadOnlyFlags.ShouldAllBe(flag => flag);
        probe.UserIds.ShouldAllBe(id => id == Alice);
    }

    private void GivenClusters(params string[] names)
    {
        var rows = names.Select(name => new AccessSnapshotRow(
            Guid.NewGuid(),
            name,
            "Display",
            ClusterIsEnabled: true,
            nameof(ClusterEnvironment.Production),
            nameof(ClusterDistribution.OpenShift),
            $"https://api.{name}.example.test:6443",
            CaBundlePem: null,
            SkipTlsVerify: false,
            WebConsoleUrl: null,
            Guid.NewGuid(),
            GroupName: null,
            Priority: null,
            nameof(AccessMode.ReadWrite),
            Guid.NewGuid(),
            "sa-viewer",
            [1, 2, 3],
            InspectNamespaces: [])).ToList();
        _dispatcher.Send(Arg.Any<IRequest<Result<AccessSnapshot>>>(), Arg.Any<CancellationToken>())
            .Returns(Result.Success(new AccessSnapshot(true, "alice", false, [], rows)));
    }

    private async Task<FleetStatusStream> HandleAsync(IClusterHealthProbe probe, int maxClusterConcurrency = 10)
    {
        var handler = new GetFleetStatusHandler(
            new ClusterAccessReader(_dispatcher, NullLogger<ClusterAccessReader>.Instance),
            _currentUser,
            probe,
            _clock,
            Options.Create(new FleetOptions { MaxClusterConcurrency = maxClusterConcurrency }),
            _logger);
        var result = await handler.Handle(new GetFleetStatusQuery(), Ct);
        return result.Value;
    }

    private static async Task<List<FleetClusterStatusDto>> ReadAllAsync(FleetStatusStream stream, CancellationToken? ct = null)
    {
        var lines = new List<FleetClusterStatusDto>();
        await foreach (var line in stream.ReadAllAsync(ct ?? Ct))
        {
            lines.Add(line);
        }

        return lines;
    }

    private static ClusterHealthFacts Healthy() =>
        new(ProbedAt, null, null, null, null, new FleetNodesDto(FleetProbeOutcome.Ok, 3, 3, 0, 0));

    private static void InterlockedMax(ref int target, int value)
    {
        int seen;
        while ((seen = Volatile.Read(ref target)) < value && Interlocked.CompareExchange(ref target, value, seen) != seen)
        {
        }
    }

    /// <summary>A probe driven by a delegate; records what it was called with (thread-safe).</summary>
    private sealed class FakeProbe(Func<ResolvedClusterAccess, CancellationToken, Task<ClusterHealthFacts>> probe) : IClusterHealthProbe
    {
        private readonly TaskCompletionSource _allStarted = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _cancellations;

        public System.Collections.Concurrent.ConcurrentBag<bool> SessionReadOnlyFlags { get; } = [];

        public System.Collections.Concurrent.ConcurrentBag<UserId> UserIds { get; } = [];

        public Task AllStarted => _allStarted.Task;

        public int CancellationsObserved => Volatile.Read(ref _cancellations);

        /// <summary>Every probe hangs until cancelled (and counts that), except <paramref name="completes"/>.</summary>
        public static FakeProbe Hanging(int expectedCalls, string? completes = null)
        {
            var started = 0;
            FakeProbe? fake = null;
            fake = new FakeProbe(async (access, ct) =>
            {
                if (Interlocked.Increment(ref started) == expectedCalls)
                {
                    fake!._allStarted.SetResult();
                }

                if (access.ClusterName.Value == completes)
                {
                    return Healthy();
                }

                try
                {
                    await Task.Delay(Timeout.Infinite, ct);
                    throw new InvalidOperationException("unreachable");
                }
                catch (OperationCanceledException)
                {
                    Interlocked.Increment(ref fake!._cancellations);
                    throw;
                }
            });
            return fake;
        }

        public Task<ClusterHealthFacts> ProbeAsync(
            ResolvedClusterAccess access, UserId userId, bool sessionIsReadOnly, CancellationToken cancellationToken)
        {
            SessionReadOnlyFlags.Add(sessionIsReadOnly);
            UserIds.Add(userId);
            return probe(access, cancellationToken);
        }
    }
}
