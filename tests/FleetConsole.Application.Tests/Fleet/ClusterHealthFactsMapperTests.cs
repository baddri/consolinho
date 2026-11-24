using System.Text.Json;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Fleet;
using Shouldly;

namespace FleetConsole.Application.Tests.Fleet;

/// <summary><see cref="ClusterHealthFactsMapper"/>: failure kinds, precedence and sections (contract §2), and the
/// cached facts' JSON round trip.</summary>
public sealed class ClusterHealthFactsMapperTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 25, 9, 0, 0, TimeSpan.Zero);

    private static readonly NodeCounts SomeNodes = new(Total: 5, Ready: 3, Unschedulable: 1);

    public static TheoryData<ProbeFailureKind, FleetClusterFailure> ClusterLevelKinds => new()
    {
        { ProbeFailureKind.DnsFailure, FleetClusterFailure.Unreachable },
        { ProbeFailureKind.ConnectionRefused, FleetClusterFailure.Unreachable },
        { ProbeFailureKind.TlsUnknownAuthority, FleetClusterFailure.TlsError },
        { ProbeFailureKind.TlsHostnameMismatch, FleetClusterFailure.TlsError },
        { ProbeFailureKind.TlsCertificateExpired, FleetClusterFailure.TlsError },
        { ProbeFailureKind.TlsOther, FleetClusterFailure.TlsError },
        { ProbeFailureKind.Timeout, FleetClusterFailure.Timeout },
        { ProbeFailureKind.Unauthorized, FleetClusterFailure.TokenInvalid },
        { ProbeFailureKind.UnexpectedStatus, FleetClusterFailure.UpstreamError },
        { ProbeFailureKind.InvalidResponse, FleetClusterFailure.UpstreamError },
    };

    [Theory]
    [MemberData(nameof(ClusterLevelKinds))]
    public void ClusterLevelKind_OnAnyProbe_IsTheFailure_AndNullsEverySection(ProbeFailureKind kind, FleetClusterFailure expected)
    {
        var reading = OpenShift(
            ProbeResponse<ClusterVersionFacts>.Ok(new("4.17.3", "4.17.3", true, false, false, 0)),
            ProbeResponse<ClusterOperatorCounts>.Fail(Failure(kind)),
            ProbeResponse<NodeCounts>.Ok(SomeNodes));

        var facts = ClusterHealthFactsMapper.Map(reading, Now);

        facts.ShouldBe(new ClusterHealthFacts(Now, expected, null, null, null, null));
    }

    [Theory]
    [InlineData(ProbeFailureKind.Unauthorized, ProbeFailureKind.DnsFailure, FleetClusterFailure.Unreachable)]
    [InlineData(ProbeFailureKind.Timeout, ProbeFailureKind.TlsOther, FleetClusterFailure.TlsError)]
    [InlineData(ProbeFailureKind.Unauthorized, ProbeFailureKind.Timeout, FleetClusterFailure.Timeout)]
    [InlineData(ProbeFailureKind.UnexpectedStatus, ProbeFailureKind.Unauthorized, FleetClusterFailure.TokenInvalid)]
    [InlineData(ProbeFailureKind.Forbidden, ProbeFailureKind.InvalidResponse, FleetClusterFailure.UpstreamError)]
    public void MixedKinds_MostSevereWins(ProbeFailureKind first, ProbeFailureKind second, FleetClusterFailure expected)
    {
        var reading = OpenShift(
            ProbeResponse<ClusterVersionFacts>.Fail(Failure(first)),
            ProbeResponse<ClusterOperatorCounts>.Ok(new(30, 0, 0, 0)),
            ProbeResponse<NodeCounts>.Fail(Failure(second)));

        ClusterHealthFactsMapper.Map(reading, Now).Failure.ShouldBe(expected);
    }

    [Fact]
    public void OpenShift_AllOk_MapsEverySection_AndComputesNotReady()
    {
        var reading = OpenShift(
            ProbeResponse<ClusterVersionFacts>.Ok(new("4.17.3", "4.18.1", true, true, false, 2)),
            ProbeResponse<ClusterOperatorCounts>.Ok(new(33, 1, 2, 3)),
            ProbeResponse<NodeCounts>.Ok(SomeNodes));

        var facts = ClusterHealthFactsMapper.Map(reading, Now);

        facts.ShouldBe(new ClusterHealthFacts(
            Now,
            null,
            null,
            new FleetClusterVersionDto(FleetProbeOutcome.Ok, "4.17.3", "4.18.1", true, true, false, 2),
            new FleetClusterOperatorsDto(FleetProbeOutcome.Ok, 33, 1, 2, 3),
            new FleetNodesDto(FleetProbeOutcome.Ok, 5, 3, 2, 1)));
    }

    [Fact]
    public void ForbiddenAndNotFound_AreSectionOutcomes_WithNullCounts()
    {
        var reading = OpenShift(
            ProbeResponse<ClusterVersionFacts>.Fail(Failure(ProbeFailureKind.NotFound)),
            ProbeResponse<ClusterOperatorCounts>.Fail(Failure(ProbeFailureKind.Forbidden)),
            ProbeResponse<NodeCounts>.Fail(Failure(ProbeFailureKind.Forbidden)));

        var facts = ClusterHealthFactsMapper.Map(reading, Now);

        facts.Failure.ShouldBeNull();
        facts.ClusterVersion.ShouldBe(new FleetClusterVersionDto(FleetProbeOutcome.NotFound, null, null, null, null, null, null));
        facts.ClusterOperators.ShouldBe(new FleetClusterOperatorsDto(FleetProbeOutcome.Forbidden, null, null, null, null));
        facts.Nodes.ShouldBe(new FleetNodesDto(FleetProbeOutcome.Forbidden, null, null, null, null));
    }

    [Fact]
    public void Kubernetes_HasVersionAndNodes_ButNoOpenShiftSections()
    {
        var reading = new ClusterHealthReading(
            ProbeResponse<KubernetesVersionFacts>.Ok(new("v1.31.4")),
            null,
            null,
            ProbeResponse<NodeCounts>.Ok(new(3, 3, 0)));

        var facts = ClusterHealthFactsMapper.Map(reading, Now);

        facts.KubernetesVersion.ShouldBe(new FleetKubernetesVersionDto(FleetProbeOutcome.Ok, "v1.31.4"));
        facts.ClusterVersion.ShouldBeNull();
        facts.ClusterOperators.ShouldBeNull();
        facts.Nodes.ShouldBe(new FleetNodesDto(FleetProbeOutcome.Ok, 3, 3, 0, 0));
    }

    [Fact]
    public void Kubernetes_ForbiddenVersion_IsASectionOutcome()
    {
        var reading = new ClusterHealthReading(
            ProbeResponse<KubernetesVersionFacts>.Fail(Failure(ProbeFailureKind.Forbidden)),
            null,
            null,
            ProbeResponse<NodeCounts>.Ok(new(1, 0, 0)));

        var facts = ClusterHealthFactsMapper.Map(reading, Now);

        facts.KubernetesVersion.ShouldBe(new FleetKubernetesVersionDto(FleetProbeOutcome.Forbidden, null));
        facts.Nodes!.NotReady.ShouldBe(1);
    }

    [Fact]
    public void OpenShift_HasNoKubernetesVersionSection()
    {
        var reading = OpenShift(
            ProbeResponse<ClusterVersionFacts>.Ok(new(null, null, null, null, null, 0)),
            ProbeResponse<ClusterOperatorCounts>.Ok(new(0, 0, 0, 0)),
            ProbeResponse<NodeCounts>.Ok(new(0, 0, 0)));

        ClusterHealthFactsMapper.Map(reading, Now).KubernetesVersion.ShouldBeNull();
    }

    [Fact]
    public void Facts_RoundTripThroughSystemTextJson()
    {
        // The facts travel through Redis (FusionCache's System.Text.Json serializer), so they must round-trip.
        var facts = new ClusterHealthFacts(
            Now,
            null,
            new FleetKubernetesVersionDto(FleetProbeOutcome.Ok, "v1.31.4"),
            new FleetClusterVersionDto(FleetProbeOutcome.Ok, "4.17.3", "4.18.1", true, null, false, 2),
            new FleetClusterOperatorsDto(FleetProbeOutcome.Forbidden, null, null, null, null),
            new FleetNodesDto(FleetProbeOutcome.Ok, 5, 3, 2, 1));
        var failed = ClusterHealthFacts.Failed(Now, FleetClusterFailure.TlsError);

        JsonSerializer.Deserialize<ClusterHealthFacts>(JsonSerializer.Serialize(facts)).ShouldBe(facts);
        JsonSerializer.Deserialize<ClusterHealthFacts>(JsonSerializer.Serialize(failed)).ShouldBe(failed);
    }

    private static ClusterHealthReading OpenShift(
        ProbeResponse<ClusterVersionFacts> clusterVersion,
        ProbeResponse<ClusterOperatorCounts> operators,
        ProbeResponse<NodeCounts> nodes) => new(null, clusterVersion, operators, nodes);

    private static ProbeFailure Failure(ProbeFailureKind kind) => new(kind, $"fake {kind}");
}
