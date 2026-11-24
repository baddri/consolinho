using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Groups.GetGroup;
using FleetConsole.Application.Groups.ListGroups;
using FleetConsole.Application.Tests.Auth;
using FleetConsole.Application.Tests.Audit;
using FleetConsole.Application.Tests.Clusters;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using NSubstitute;

namespace FleetConsole.Application.Tests.Groups;

/// <summary>
/// <see cref="ListGroupsHandler"/> and <see cref="GetGroupHandler"/> over an in-memory read model and a substituted host
/// directory (contract CP4.5a §4): the host ∪ grants union, null host facts when the listing fails, members marked
/// registered, and the 404 rules.
/// </summary>
public sealed class GroupQueryHandlerTests
{
    private static readonly DateTimeOffset ReadAt = new(2026, 11, 24, 9, 0, 0, TimeSpan.Zero);

    private readonly InMemoryReadModel _model = new();
    private readonly IHostGroupDirectory _directory = Substitute.For<IHostGroupDirectory>();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private Task<Domain.Common.Result<GroupListDto>> ListAsync() =>
        new ListGroupsHandler(_directory, _model).Handle(new ListGroupsQuery(), Ct);

    private Task<Domain.Common.Result<GroupDetailDto>> GetAsync(string name) =>
        new GetGroupHandler(_directory, _model).Handle(new GetGroupQuery(name), Ct);

    private void HostLists(params HostGroup[] groups) =>
        _directory.GetAsync(Arg.Any<CancellationToken>()).Returns(new HostGroupListing(HostGroupsStatus.Ok, ReadAt, groups));

    private void HostFails(HostGroupsStatus status) =>
        _directory.GetAsync(Arg.Any<CancellationToken>()).Returns(HostGroupListing.Failed(status));

    private void GrantToGroup(string group, string clusterName)
    {
        var cluster = TestClusters.Create(clusterName);
        var credential = Credential.Add(
            cluster, CredentialName.Create("sa-" + clusterName).Value, null, new EncryptedToken([9]),
            TokenFingerprint.Create("0123abcd").Value, TokenMetadata.Opaque, InspectNamespaces.Empty, "admin", FixedClock.Now);
        _model.GrantRows.Add(Grant.CreateForGroup(
            GroupName.Create(group).Value, cluster, credential, AccessMode.ReadOnly, 10, [], "admin", FixedClock.Now).Value);
    }

    [Fact]
    public async Task List_UnionsHostAndGrantOnlyGroups_SortedOrdinal_WithCounts()
    {
        HostLists(new HostGroup("sre", ["alice", "bob"]), new HostGroup("Dev", []));
        GrantToGroup("sre", "prod-a");
        GrantToGroup("sre", "prod-b");
        GrantToGroup("gone", "prod-c");

        var list = (await ListAsync()).Value;

        list.HostStatus.ShouldBe(HostGroupsStatus.Ok);
        list.HostReadAt.ShouldBe(ReadAt);
        list.Items.ShouldBe(
        [
            new GroupRowDto("Dev", true, 0, 0),
            new GroupRowDto("gone", false, null, 1),
            new GroupRowDto("sre", true, 2, 2),
        ]);
    }

    [Theory]
    [InlineData(HostGroupsStatus.Forbidden)]
    [InlineData(HostGroupsStatus.Unavailable)]
    public async Task List_HostNotReadable_ListsGrantOnlyGroups_WithUnknownHostFacts(HostGroupsStatus status)
    {
        HostFails(status);
        GrantToGroup("sre", "prod-a");

        var list = (await ListAsync()).Value;

        list.HostStatus.ShouldBe(status);
        list.HostReadAt.ShouldBeNull();
        list.Items.ShouldBe([new GroupRowDto("sre", null, null, 1)]);
    }

    [Fact]
    public async Task Get_ListsMembersOrdinal_MarkingRegisteredUsers()
    {
        HostLists(new HostGroup("sre", ["zed", "alice", "Bob", "dee"]));
        _model.UserRows.Add(AuthTestUsers.PreCreated("alice"));
        _model.UserRows.Add(AuthTestUsers.Deactivated("dee"));
        GrantToGroup("sre", "prod-a");

        var detail = (await GetAsync("sre")).Value;

        detail.FoundOnHost.ShouldBe(true);
        detail.ClusterCount.ShouldBe(1);
        detail.HostReadAt.ShouldBe(ReadAt);
        detail.Members.ShouldNotBeNull().ShouldBe(
        [
            new GroupMemberDto("Bob", false, null, null),
            new GroupMemberDto("alice", true, null, UserStatus.Pending),
            new GroupMemberDto("dee", true, null, UserStatus.Deactivated),
            new GroupMemberDto("zed", false, null, null),
        ]);
    }

    [Fact]
    public async Task Get_GrantOnlyGroup_IsFoundWithoutMembers()
    {
        HostLists(new HostGroup("other", ["alice"]));
        GrantToGroup("gone", "prod-a");

        var detail = (await GetAsync("gone")).Value;

        detail.FoundOnHost.ShouldBe(false);
        detail.Members.ShouldBeNull();
        detail.ClusterCount.ShouldBe(1);
    }

    [Theory]
    [InlineData(HostGroupsStatus.Forbidden)]
    [InlineData(HostGroupsStatus.Unavailable)]
    public async Task Get_HostNotReadable_AnswersEvenWithoutGrants_WithUnknownHostFacts(HostGroupsStatus status)
    {
        HostFails(status);

        var detail = (await GetAsync("anything")).Value;

        detail.HostStatus.ShouldBe(status);
        detail.FoundOnHost.ShouldBeNull();
        detail.Members.ShouldBeNull();
        detail.ClusterCount.ShouldBe(0);
    }

    [Theory]
    [InlineData("nowhere")]
    [InlineData("50%-team")]
    [InlineData("system:authenticated")]
    [InlineData("")]
    public async Task Get_InvalidOrUnknownGroup_IsNotFound_WithoutEchoingTheName(string name)
    {
        HostLists(new HostGroup("sre", ["alice"]));

        var result = await GetAsync(name);

        result.IsFailure.ShouldBeTrue();
        result.Error.Code.ShouldBe("Groups.NotFound");
        result.Error.Message.ShouldBe("Group was not found.");
    }
}
