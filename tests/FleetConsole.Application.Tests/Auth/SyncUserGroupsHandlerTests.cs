using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Auth.SyncUserGroups;
using FleetConsole.Application.Tests.Audit;
using FleetConsole.Application.Tests.Clusters;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using FleetConsole.Domain.Users.Events;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace FleetConsole.Application.Tests.Auth;

/// <summary>
/// <see cref="SyncUserGroupsHandler"/> with in-memory fakes (ADR-0039 §3): membership from the host listing, the check
/// time recorded either way, and the fail-closed rule when the host can't be read.
/// </summary>
public sealed class SyncUserGroupsHandlerTests
{
    private static readonly DateTimeOffset ReadAt = new(2026, 11, 24, 9, 0, 0, TimeSpan.Zero);

    private readonly InMemoryUserRepository _users = new();
    private readonly InMemoryReadModel _model = new();
    private readonly RecordingGroupCheckRecorder _checks = new();
    private readonly IHostGroupDirectory _directory = Substitute.For<IHostGroupDirectory>();
    private readonly User _sam = AuthTestUsers.LoggedInBefore("sam", adminSource: null); // recorded groups: ["old-group"]

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public SyncUserGroupsHandlerTests() => _users.Users.Add(_sam);

    private Task<Domain.Common.Result> SyncAsync(UserId? id = null) =>
        new SyncUserGroupsHandler(_users, _directory, _checks, _model, NullLogger<SyncUserGroupsHandler>.Instance)
            .Handle(new SyncUserGroupsCommand(id ?? _sam.Id), Ct);

    private void HostLists(params HostGroup[] groups) =>
        _directory.GetAsync(Arg.Any<CancellationToken>()).Returns(new HostGroupListing(HostGroupsStatus.Ok, ReadAt, groups));

    private void HostFails(HostGroupsStatus status) =>
        _directory.GetAsync(Arg.Any<CancellationToken>()).Returns(HostGroupListing.Failed(status));

    private void GrantToGroup(string group)
    {
        var cluster = TestClusters.Create("prod-" + group);
        var credential = Credential.Add(
            cluster, CredentialName.Create("sa-" + group).Value, null, new EncryptedToken([9]),
            TokenFingerprint.Create("0123abcd").Value, TokenMetadata.Opaque, InspectNamespaces.Empty, "admin", FixedClock.Now);
        _model.GrantRows.Add(Grant.CreateForGroup(
            GroupName.Create(group).Value, cluster, credential, AccessMode.ReadOnly, 10, [], "admin", FixedClock.Now).Value);
    }

    [Fact]
    public async Task ChangedMembership_ReplacesGroups_RaisesEvent_AndRecordsTheReadTime()
    {
        HostLists(
            new HostGroup("sre-emea", ["sam", "alice"]),
            new HostGroup("old-group", ["alice"]),
            new HostGroup("Sam-only-by-case", ["Sam"]));

        (await SyncAsync()).IsSuccess.ShouldBeTrue();

        _sam.Groups.ShouldBe(["sre-emea"], "ordinal membership; old-group was left on the host");
        var changed = _sam.DomainEvents.OfType<UserGroupsChanged>().ShouldHaveSingleItem();
        changed.Added.ShouldBe(["sre-emea"]);
        changed.Removed.ShouldBe(["old-group"]);
        _checks.Checks.ShouldBe([new UserGroupCheck(_sam.Id, ReadAt)]);
    }

    [Fact]
    public async Task MixedCaseSystemGroups_AreNotRecorded()
    {
        HostLists(
            new HostGroup("System:Ops", ["sam"]),
            new HostGroup("SYSTEM:authenticated", ["sam"]),
            new HostGroup("sre", ["sam"]));

        (await SyncAsync()).IsSuccess.ShouldBeTrue();

        _sam.Groups.ShouldBe(["sre"], "system: is virtual in any case (GRP-3, T-0272)");
    }

    [Fact]
    public async Task UnchangedMembership_RaisesNothing_ButRecordsTheReadTime()
    {
        HostLists(new HostGroup("old-group", ["sam"]));

        (await SyncAsync()).IsSuccess.ShouldBeTrue();

        _sam.Groups.ShouldBe(["old-group"]);
        _sam.DomainEvents.ShouldBeEmpty();
        _checks.Checks.ShouldBe([new UserGroupCheck(_sam.Id, ReadAt)]);
    }

    [Fact]
    public async Task RemovedFromEveryGroup_ClearsGroups()
    {
        HostLists(new HostGroup("other", ["alice"]));

        (await SyncAsync()).IsSuccess.ShouldBeTrue();

        _sam.Groups.ShouldBeEmpty();
    }

    [Theory]
    [InlineData(HostGroupsStatus.Unavailable)]
    [InlineData(HostGroupsStatus.Forbidden)]
    public async Task HostUnreadable_AndRecordedGroupCarriesAGrant_FailsClosed(HostGroupsStatus status)
    {
        HostFails(status);
        GrantToGroup("old-group");

        var result = await SyncAsync();

        result.Error.ShouldBe(AuthErrors.GroupsUnavailable);
        _sam.Groups.ShouldBe(["old-group"]);
        _sam.DomainEvents.ShouldBeEmpty();
        _checks.Checks.ShouldBeEmpty("nothing was read");
    }

    [Fact]
    public async Task HostUnreadable_AndNoRecordedGroupCarriesAGrant_KeepsTheSession()
    {
        HostFails(HostGroupsStatus.Unavailable);
        GrantToGroup("someone-elses-group");

        (await SyncAsync()).IsSuccess.ShouldBeTrue();

        _sam.Groups.ShouldBe(["old-group"]);
        _checks.Checks.ShouldBeEmpty();
    }

    [Fact]
    public async Task HostUnreadable_UserWithoutGroups_KeepsTheSession()
    {
        var fresh = AuthTestUsers.PreCreated("fresh");
        _users.Users.Add(fresh);
        HostFails(HostGroupsStatus.Unavailable);

        (await SyncAsync(fresh.Id)).IsSuccess.ShouldBeTrue();
    }

    [Fact]
    public async Task UnknownUser_IsNotFound()
    {
        (await SyncAsync(UserId.New())).Error.ShouldNotBeNull().Code.ShouldBe("Users.NotFound");
        await _directory.DidNotReceive().GetAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public void Command_IsInternalPlumbing_NotAuthenticatedAdminOrMutating()
    {
        // Read-only users must sync (ReadOnlyGuardBehavior skips non-mutating commands); it runs before authentication.
        var command = new SyncUserGroupsCommand(UserId.New());
        command.ShouldNotBeAssignableTo<IMutatingCommand>();
        command.ShouldNotBeAssignableTo<IRequireAuthenticated>();
        command.ShouldNotBeAssignableTo<IAdminRequest>();
    }
}
