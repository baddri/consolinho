using FleetConsole.Application.Audit;
using FleetConsole.Application.Audit.EventHandlers;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Clusters.Events;

namespace FleetConsole.Application.Tests.Audit;

public sealed class ClusterAuditHandlerTests
{
    private static readonly ClusterId Id = ClusterId.New();

    private readonly RecordingAuditTrail _trail = new();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private ClusterAuditHandler Handler => new(_trail);

    [Fact]
    public async Task ClusterRegistered_RecordsEnvironmentDistributionUrlTlsModeAndEnabled()
    {
        await Handler.Handle(
            new ClusterRegistered(
                Id, "prod-eu-1", ClusterEnvironment.Production, ClusterDistribution.Kubernetes,
                "https://api.prod-eu-1.example.com:6443", ClusterTlsMode.CaBundle, IsEnabled: true),
            Ct);

        var record = ShouldBeClusterEntry("cluster.registered");
        record.Summary.ShouldBe("Registered cluster prod-eu-1");
        var details = AuditDetails.Of(record).ShouldHaveExactly("environment", "distribution", "apiUrl", "tlsMode", "isEnabled");
        details.Str("environment").ShouldBe("production");
        details.Str("distribution").ShouldBe("kubernetes");
        details.Str("apiUrl").ShouldBe("https://api.prod-eu-1.example.com:6443");
        details.Str("tlsMode").ShouldBe("caBundle");
        details.GetProperty("isEnabled").GetBoolean().ShouldBeTrue();
    }

    [Fact]
    public async Task ClusterUpdated_RecordsChangedFieldNamesOnly()
    {
        await Handler.Handle(new ClusterUpdated(Id, "prod-eu-1", ["apiUrl", "caBundle"]), Ct);

        var record = ShouldBeClusterEntry("cluster.updated");
        AuditDetails.Of(record).ShouldHaveExactly("changedFields")
            .GetProperty("changedFields").EnumerateArray().Select(f => f.GetString()).ShouldBe(["apiUrl", "caBundle"]);
    }

    [Fact]
    public async Task ClusterEnabled_HasEmptyDetails()
    {
        await Handler.Handle(new ClusterEnabled(Id, "prod-eu-1"), Ct);

        ShouldBeClusterEntry("cluster.enabled").Summary.ShouldBe("Enabled cluster prod-eu-1");
        AuditDetails.Of(_trail.Single).ShouldHaveExactly();
    }

    [Fact]
    public async Task ClusterDisabled_HasEmptyDetails()
    {
        await Handler.Handle(new ClusterDisabled(Id, "prod-eu-1"), Ct);

        ShouldBeClusterEntry("cluster.disabled").Summary.ShouldBe("Disabled cluster prod-eu-1");
        AuditDetails.Of(_trail.Single).ShouldHaveExactly();
    }

    [Fact]
    public async Task ClusterDeleted_RecordsTheCascadedCounts()
    {
        await Handler.Handle(new ClusterDeleted(Id, "prod-eu-1", CredentialCount: 2, GrantCount: 5), Ct);

        var details = AuditDetails.Of(ShouldBeClusterEntry("cluster.deleted")).ShouldHaveExactly("credentialCount", "grantCount");
        details.GetProperty("credentialCount").GetInt32().ShouldBe(2);
        details.GetProperty("grantCount").GetInt32().ShouldBe(5);
    }

    /// <summary>Shared by every <c>cluster.*</c> entry: cluster target and cluster name, current-user actor, no related user.</summary>
    private AuditRecord ShouldBeClusterEntry(string action)
    {
        var record = _trail.Single;
        record.Action.ShouldBe(action);
        record.TargetType.ShouldBe(AuditTargetType.Cluster);
        record.TargetId.ShouldBe(Id.Value.ToString());
        record.TargetName.ShouldBe("prod-eu-1");
        record.ClusterName.ShouldBe("prod-eu-1");
        record.Actor.ShouldBeNull("cluster actions are attributed to the current user");
        record.RelatedUsername.ShouldBeNull();
        record.Summary.ShouldContain("prod-eu-1");
        return record;
    }
}
