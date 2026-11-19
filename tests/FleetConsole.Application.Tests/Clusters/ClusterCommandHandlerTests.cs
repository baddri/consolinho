using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Clusters;
using FleetConsole.Application.Clusters.DeleteCluster;
using FleetConsole.Application.Clusters.DisableCluster;
using FleetConsole.Application.Clusters.EnableCluster;
using FleetConsole.Application.Clusters.RegisterCluster;
using FleetConsole.Application.Clusters.UpdateCluster;
using FleetConsole.Application.Tests.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Clusters.Events;
using FleetConsole.Domain.Users;
using NSubstitute;

namespace FleetConsole.Application.Tests.Clusters;

/// <summary>
/// The cluster command handlers: route name lookup (404), version check (409), name uniqueness, and that they leave
/// the rules to the aggregate (events raised by <c>Cluster</c> drive the audit entries).
/// </summary>
public sealed class ClusterCommandHandlerTests
{
    private readonly InMemoryClusterRepository _clusters = new();
    private readonly FakeCurrentUser _admin = FakeCurrentUser.SignedIn(UserRole.Admin, username: "root");

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Register_AddsClusterWithTrimmedText_AndReturnsName()
    {
        var handler = new RegisterClusterHandler(_clusters, _admin, new FixedClock());

        var result = await handler.Handle(
            new RegisterClusterCommand(
                "prod-west", "  West  ", "https://api.west.example.com:6443/", ClusterEnvironment.Staging,
                " https://console.west.example.com ", "   ", null, false, IsEnabled: false),
            Ct);

        result.Value.ShouldBe("prod-west");
        var cluster = _clusters.Clusters.ShouldHaveSingleItem();
        cluster.DisplayName.ShouldBe("West");
        cluster.Description.ShouldBeNull();
        cluster.WebConsoleUrl!.OriginalString.ShouldBe("https://console.west.example.com");
        cluster.Endpoint.ToString().ShouldBe("https://api.west.example.com:6443");
        cluster.IsEnabled.ShouldBeFalse();
        cluster.CreatedBy.ShouldBe("root");
        cluster.CreatedAt.ShouldBe(FixedClock.Now);
    }

    [Fact]
    public async Task Register_TakenName_ReturnsNameTaken()
    {
        _clusters.Add(TestClusters.Create("prod-east"));
        var handler = new RegisterClusterHandler(_clusters, _admin, new FixedClock());

        var result = await handler.Handle(
            new RegisterClusterCommand("prod-east", null, "https://api.example.com", ClusterEnvironment.Production, null, null, null, false, true),
            Ct);

        result.Error!.Code.ShouldBe("Clusters.NameTaken");
        _clusters.Clusters.Count.ShouldBe(1);
    }

    [Fact]
    public async Task Update_AtCurrentVersion_UpdatesAndRaisesEvent()
    {
        var cluster = TestClusters.Create();
        cluster.ClearDomainEvents();
        _clusters.Add(cluster);
        var handler = new UpdateClusterHandler(_clusters, _admin, new FixedClock());

        var result = await handler.Handle(
            new UpdateClusterCommand(
                "prod-east", "East", "https://api.prod-east.example.com:6443", ClusterEnvironment.Production, null, null, null,
                SkipTlsVerify: true, cluster.Version),
            Ct);

        result.IsSuccess.ShouldBeTrue();
        cluster.DisplayName.ShouldBe("East");
        cluster.Endpoint.TlsMode.ShouldBe(ClusterTlsMode.SkipVerify);
        cluster.ConnectionSettingsChangedAt.ShouldBe(FixedClock.Now);
        cluster.UpdatedBy.ShouldBe("root");
        cluster.DomainEvents.OfType<ClusterUpdated>().ShouldHaveSingleItem().ChangedFields
            .ShouldBe(["displayName", "skipTlsVerify"], ignoreOrder: true);
    }

    [Fact]
    public async Task Update_StaleVersion_ReturnsConflict_AndChangesNothing()
    {
        var cluster = TestClusters.Create();
        _clusters.Add(cluster);
        var handler = new UpdateClusterHandler(_clusters, _admin, new FixedClock());

        var result = await handler.Handle(
            new UpdateClusterCommand(
                "prod-east", "East", "https://api.prod-east.example.com:6443", ClusterEnvironment.Production, null, null, null,
                false, cluster.Version + 1),
            Ct);

        result.Error.ShouldBe(ClusterAdminErrors.StaleVersion);
        cluster.DisplayName.ShouldBe("prod-east");
    }

    [Theory]
    [InlineData("unknown")]
    [InlineData("Not_Valid")]
    public async Task Transitions_UnknownOrMalformedName_ReturnNotFound(string name)
    {
        var enable = await new EnableClusterHandler(_clusters, _admin, new FixedClock()).Handle(new EnableClusterCommand(name, 0), Ct);
        var disable = await new DisableClusterHandler(_clusters, _admin, new FixedClock()).Handle(new DisableClusterCommand(name, 0), Ct);
        var delete = await NewDeleteHandler(0, 0).Handle(new DeleteClusterCommand(name), Ct);

        enable.Error!.Code.ShouldBe("Clusters.NotFound");
        disable.Error!.Code.ShouldBe("Clusters.NotFound");
        delete.Error!.Code.ShouldBe("Clusters.NotFound");
    }

    [Fact]
    public async Task DisableThenEnable_ChangesStateAndRaisesEvents()
    {
        var cluster = TestClusters.Create();
        cluster.ClearDomainEvents();
        _clusters.Add(cluster);

        (await new DisableClusterHandler(_clusters, _admin, new FixedClock())
            .Handle(new DisableClusterCommand("prod-east", cluster.Version), Ct)).IsSuccess.ShouldBeTrue();
        cluster.IsEnabled.ShouldBeFalse();

        (await new EnableClusterHandler(_clusters, _admin, new FixedClock())
            .Handle(new EnableClusterCommand("prod-east", cluster.Version), Ct)).IsSuccess.ShouldBeTrue();
        cluster.IsEnabled.ShouldBeTrue();

        cluster.DomainEvents.Select(e => e.GetType()).ShouldBe([typeof(ClusterDisabled), typeof(ClusterEnabled)]);
    }

    [Fact]
    public async Task Enable_StaleVersion_ReturnsConflict()
    {
        var cluster = TestClusters.Create(isEnabled: false);
        _clusters.Add(cluster);

        var result = await new EnableClusterHandler(_clusters, _admin, new FixedClock())
            .Handle(new EnableClusterCommand("prod-east", cluster.Version + 1), Ct);

        result.Error.ShouldBe(ClusterAdminErrors.StaleVersion);
        cluster.IsEnabled.ShouldBeFalse();
    }

    [Fact]
    public async Task Delete_EnabledCluster_ReturnsNotDisabled_AndKeepsIt()
    {
        _clusters.Add(TestClusters.Create());

        var result = await NewDeleteHandler(2, 1).Handle(new DeleteClusterCommand("prod-east"), Ct);

        result.Error!.Code.ShouldBe("Clusters.NotDisabled");
        _clusters.Removed.ShouldBeEmpty();
    }

    [Fact]
    public async Task Delete_DisabledCluster_RemovesIt_AndRaisesEventWithCounts()
    {
        var cluster = TestClusters.Create(isEnabled: false);
        _clusters.Add(cluster);

        var result = await NewDeleteHandler(credentialCount: 2, grantCount: 5).Handle(new DeleteClusterCommand("prod-east"), Ct);

        result.IsSuccess.ShouldBeTrue();
        _clusters.Removed.ShouldBe([cluster]);
        var deleted = cluster.DomainEvents.OfType<ClusterDeleted>().ShouldHaveSingleItem();
        deleted.CredentialCount.ShouldBe(2);
        deleted.GrantCount.ShouldBe(5);
    }

    private DeleteClusterHandler NewDeleteHandler(int credentialCount, int grantCount)
    {
        var credentials = Substitute.For<ICredentialRepository>();
        credentials.CountByClusterAsync(Arg.Any<ClusterId>(), Arg.Any<CancellationToken>()).Returns(credentialCount);
        var grants = Substitute.For<IGrantRepository>();
        grants.CountByClusterAsync(Arg.Any<ClusterId>(), Arg.Any<CancellationToken>()).Returns(grantCount);
        return new DeleteClusterHandler(_clusters, credentials, grants);
    }
}
