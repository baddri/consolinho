using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Caching;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Access;
using FleetConsole.Application.Fleet;
using FleetConsole.Application.Proxy;
using FleetConsole.Application.Tests.Audit;
using FleetConsole.Application.Tests.Behaviors;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Access.Resolution;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.Diagnostics.Metrics.Testing;
using Microsoft.Extensions.Logging.Testing;
using Microsoft.Extensions.Options;
using NSubstitute;
using Shouldly;

namespace FleetConsole.Application.Tests.Fleet;

/// <summary><see cref="ClusterHealthProbe"/>: policies before cache/decrypt, key and tags by winner credential,
/// budget → timeout, caller cancellation, per-call cache duration, one metric and one log per load (ADR-0041).</summary>
public sealed class ClusterHealthProbeTests : IDisposable
{
    private const string FakeToken = "fake-fleet-token-not-a-secret";

    private static readonly ClusterId ClusterId = new(Guid.Parse("0193a000-0000-7000-8000-000000000001"));
    private static readonly CredentialId WinnerCredential = new(Guid.Parse("0193a000-0000-7000-8000-0000000000c1"));
    private static readonly UserId UserId = new(Guid.Parse("0193a000-0000-7000-8000-0000000000a1"));

    private readonly FakeQueryCache _cache = new();
    private readonly ITokenProtector _protector = Substitute.For<ITokenProtector>();
    private readonly IClusterHealthReader _reader = Substitute.For<IClusterHealthReader>();
    private readonly TestMeterFactory _meterFactory = new();
    private readonly FakeLogger<ClusterHealthProbe> _logger = new();
    private readonly List<IProxyPolicy> _policies = [];
    private readonly FleetOptions _options = new() { CacheDuration = TimeSpan.FromSeconds(17) };

    public ClusterHealthProbeTests()
    {
        _protector.Unprotect(Arg.Any<EncryptedToken>()).Returns(new SensitiveString(FakeToken));
        AnyRead(_reader).Returns(HealthyOpenShift());
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public void Dispose() => _meterFactory.Dispose();

    [Fact]
    public async Task Miss_CachesUnderClusterAndWinnerCredential_ForTheConfiguredDuration()
    {
        var facts = await Probe().ProbeAsync(Access(), UserId, sessionIsReadOnly: false, Ct);

        facts.Failure.ShouldBeNull();
        facts.CheckedAt.ShouldBe(FixedClock.Now);
        var key = $"fleet-health:v1:cluster:{ClusterId.Value:D}:credential:{WinnerCredential.Value:D}";
        _cache.Keys.ShouldBe([key]);
        _cache.Tags[key].ShouldBe([CacheTags.Cluster(ClusterId), CacheTags.Credential(WinnerCredential)], ignoreOrder: true);
        _cache.LastDuration.ShouldBe(TimeSpan.FromSeconds(17));
        await _reader.Received(1).ReadAsync(
            ClusterId, Arg.Any<ClusterConnection>(), ClusterDistribution.OpenShift,
            Arg.Is<SensitiveString>(t => t.Reveal() == FakeToken), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Hit_DecryptsNothing_AndProbesNothing()
    {
        var probe = Probe();
        await probe.ProbeAsync(Access(), UserId, false, Ct);
        _protector.ClearReceivedCalls();
        _reader.ClearReceivedCalls();

        await probe.ProbeAsync(Access(), UserId, false, Ct);

        _protector.DidNotReceiveWithAnyArgs().Unprotect(default!);
        await AnyRead(_reader.DidNotReceiveWithAnyArgs());
    }

    [Fact]
    public async Task PolicyRefusal_IsBlockedByPolicy_WithoutCacheDecryptOrUpstreamCall()
    {
        _policies.Add(new FakePolicy(Result.Failure(Error.Forbidden("Test.Refused", "No."))));

        var facts = await Probe().ProbeAsync(Access(), UserId, false, Ct);

        facts.ShouldBe(ClusterHealthFacts.Failed(FixedClock.Now, FleetClusterFailure.BlockedByPolicy));
        _cache.Keys.ShouldBeEmpty();
        _protector.DidNotReceiveWithAnyArgs().Unprotect(default!);
        await AnyRead(_reader.DidNotReceiveWithAnyArgs());
    }

    [Theory]
    [InlineData(ClusterDistribution.OpenShift, false, false, false)]
    [InlineData(ClusterDistribution.Kubernetes, true, false, true)]
    [InlineData(ClusterDistribution.OpenShift, false, true, true)]
    public async Task Policies_SeeEveryProbeGet_WithTheProxysContext(
        ClusterDistribution distribution, bool storedReadOnly, bool sessionReadOnly, bool expectedReadOnly)
    {
        var policy = new FakePolicy(Result.Success());
        _policies.Add(policy);

        await Probe().ProbeAsync(Access(distribution, storedReadOnly), UserId, sessionReadOnly, Ct);

        policy.Contexts.Select(c => c.Request.Path.Value + c.Request.QueryString)
            .ShouldBe(FleetProbePaths.For(distribution).Select(p => p.Path + p.QueryString));
        policy.Contexts.ShouldAllBe(c => c.Request.Method == "GET" && !c.Request.IsMutation && c.UserId == UserId
            && c.ClusterName == "prod-east" && c.GrantMode == AccessMode.ReadWrite && c.UserIsReadOnly == expectedReadOnly);
    }

    [Fact]
    public async Task BudgetExceeded_IsCachedTimeoutFacts()
    {
        _options.ClusterTimeout = TimeSpan.FromMilliseconds(50);
        AnyRead(_reader).Returns(async call =>
        {
            await Task.Delay(Timeout.Infinite, call.ArgAt<CancellationToken>(4));
            return HealthyOpenShift();
        });

        var facts = await Probe().ProbeAsync(Access(), UserId, false, Ct);

        facts.ShouldBe(ClusterHealthFacts.Failed(FixedClock.Now, FleetClusterFailure.Timeout));
        _cache.Keys.Count.ShouldBe(1);
    }

    [Fact]
    public async Task CallerCancellation_Throws()
    {
        using var caller = new CancellationTokenSource();
        AnyRead(_reader).Returns(async call =>
        {
            await caller.CancelAsync();
            await Task.Delay(Timeout.Infinite, call.ArgAt<CancellationToken>(4));
            return HealthyOpenShift();
        });

        await Should.ThrowAsync<OperationCanceledException>(() => Probe().ProbeAsync(Access(), UserId, false, caller.Token));
        _cache.Keys.ShouldBeEmpty();
    }

    [Fact]
    public async Task UnexpectedException_Propagates()
    {
        AnyRead(_reader).Returns<ClusterHealthReading>(_ => throw new InvalidOperationException("bug"));

        await Should.ThrowAsync<InvalidOperationException>(() => Probe().ProbeAsync(Access(), UserId, false, Ct));
    }

    [Theory]
    [InlineData(null, "ok")]
    [InlineData(ProbeFailureKind.Forbidden, "restricted")]
    [InlineData(ProbeFailureKind.ConnectionRefused, "unreachable")]
    [InlineData(ProbeFailureKind.Unauthorized, "tokenInvalid")]
    public async Task EachLoad_RecordsOneMeasurement_AndOneLogLine_WithoutTheToken(ProbeFailureKind? nodesFailure, string outcome)
    {
        var nodes = nodesFailure is { } kind
            ? ProbeResponse<NodeCounts>.Fail(new ProbeFailure(kind, "upstream said " + FakeToken))
            : ProbeResponse<NodeCounts>.Ok(new(3, 3, 0));
        AnyRead(_reader).Returns(HealthyOpenShift() with { Nodes = nodes });
        using var collector = new MetricCollector<double>(_meterFactory, ApplicationDiagnostics.MeterName, FleetMetrics.ProbeDurationName);
        var probe = Probe();

        await probe.ProbeAsync(Access(), UserId, false, Ct);
        await probe.ProbeAsync(Access(), UserId, false, Ct); // a hit: no second measurement or log

        var measurement = collector.GetMeasurementSnapshot().ShouldHaveSingleItem();
        measurement.Tags[FleetMetrics.OutcomeTag].ShouldBe(outcome);
        measurement.Value.ShouldBeGreaterThanOrEqualTo(0);

        var log = _logger.Collector.GetSnapshot().ShouldHaveSingleItem();
        log.Level.ShouldBe(outcome == "ok" ? Microsoft.Extensions.Logging.LogLevel.Debug : Microsoft.Extensions.Logging.LogLevel.Information);
        log.Message.ShouldContain(ClusterId.Value.ToString("D"));
        log.Message.ShouldContain(outcome);
        log.Message.ShouldNotContain(FakeToken);
        log.Message.ShouldNotContain("upstream said");
    }

    [Fact]
    public void ProbePaths_AreValidProxyGets()
    {
        // The static ProxyRequests are built from FleetProbePaths; a path the proxy rejects would fail type init.
        Should.NotThrow(() => ClusterHealthProbe.CacheKey(ClusterId, WinnerCredential.Value));
        FleetProbePaths.For(ClusterDistribution.OpenShift).Count.ShouldBe(3);
        FleetProbePaths.For(ClusterDistribution.Kubernetes).Count.ShouldBe(2);
    }

    private static Task<ClusterHealthReading> AnyRead(IClusterHealthReader reader) => reader.ReadAsync(
        Arg.Any<ClusterId>(), Arg.Any<ClusterConnection>(), Arg.Any<ClusterDistribution>(), Arg.Any<SensitiveString>(),
        Arg.Any<CancellationToken>());

    /// <summary>Records every context it sees and answers with a fixed decision.</summary>
    private sealed class FakePolicy(Result decision) : IProxyPolicy
    {
        public List<ProxyRequestContext> Contexts { get; } = [];

        public ValueTask<Result> EvaluateAsync(ProxyRequestContext context, CancellationToken ct)
        {
            lock (Contexts)
            {
                Contexts.Add(context);
            }

            return ValueTask.FromResult(decision);
        }
    }

    private ClusterHealthProbe Probe() => new(
        _policies,
        _cache,
        _protector,
        _reader,
        new FixedClock(),
        new FleetMetrics(_meterFactory),
        Options.Create(_options),
        _logger);

    private static ClusterHealthReading HealthyOpenShift() => new(
        null,
        ProbeResponse<ClusterVersionFacts>.Ok(new("4.17.3", "4.17.3", true, false, false, 0)),
        ProbeResponse<ClusterOperatorCounts>.Ok(new(33, 0, 0, 0)),
        ProbeResponse<NodeCounts>.Ok(new(3, 3, 0)));

    private static ResolvedClusterAccess Access(ClusterDistribution distribution = ClusterDistribution.OpenShift, bool storedReadOnly = false)
    {
        // A group grant whose credential differs from any other id in play, so the key can only come from the winner.
        var winner = new AccessCandidate(new GrantId(Guid.NewGuid()), "ops", 10, AccessMode.ReadWrite, WinnerCredential);
        return new ResolvedClusterAccess(
            ClusterId,
            ClusterName.Create("prod-east").Value,
            "Prod East",
            ClusterEnvironment.Production,
            distribution,
            new ClusterConnection(new Uri("https://api.prod-east.example.test:6443"), null, false),
            null,
            "alice",
            storedReadOnly,
            new AccessResolution(winner, AccessMode.ReadWrite, false, [], false),
            new EncryptedToken([1, 2, 3]),
            "ops-sa",
            [],
            new Dictionary<GrantId, string>());
    }
}
