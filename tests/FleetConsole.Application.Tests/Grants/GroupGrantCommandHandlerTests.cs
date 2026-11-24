using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Grants.BulkGrant;
using FleetConsole.Application.Grants.BulkGroupGrant;
using FleetConsole.Application.Grants.CreateGroupGrant;
using FleetConsole.Application.Grants.UpdateGrant;
using FleetConsole.Application.Tests.Audit;
using FleetConsole.Application.Tests.Auth;
using FleetConsole.Application.Tests.Clusters;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Access.Events;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using NSubstitute;

namespace FleetConsole.Application.Tests.Grants;

/// <summary>
/// The group grant command handlers (CP4.5 contract §2-3): create with field errors and the two 409s (GRP-4/5), the
/// all-or-nothing bulk with every item conflict on the item's cluster (GPG-3), one slot query per request, and
/// priority on update (required for group grants, refused for user grants).
/// </summary>
public sealed class GroupGrantCommandHandlerTests
{
    private readonly InMemoryUserRepository _users = new();
    private readonly InMemoryClusterRepository _clusters = new();
    private readonly ICredentialRepository _credentials = Substitute.For<ICredentialRepository>();
    private readonly IGrantRepository _grants = Substitute.For<IGrantRepository>();
    private readonly List<Grant> _added = [];
    private readonly List<(ClusterId ClusterId, GroupGrantSlot Slot)> _slots = [];
    private readonly GroupName _sre = GroupName.Create("sre").Value;
    private readonly Cluster _prod = NewCluster("prod-eu-1");
    private readonly Cluster _stage = NewCluster("stage-eu-1");
    private readonly Credential _prodView;
    private readonly Credential _prodEdit;
    private readonly Credential _stageView;

    public GroupGrantCommandHandlerTests()
    {
        _clusters.Clusters.AddRange([_prod, _stage]);
        _prodView = NewCredential(_prod, "fleet-view");
        _prodEdit = NewCredential(_prod, "fleet-edit");
        _stageView = NewCredential(_stage, "fleet-view");
        Credential[] all = [_prodView, _prodEdit, _stageView];
        _credentials.GetByIdsAsync(Arg.Any<IReadOnlyCollection<CredentialId>>(), Arg.Any<CancellationToken>())
            .Returns(call => all.Where(c => call.Arg<IReadOnlyCollection<CredentialId>>().Contains(c.Id)).ToList());
        _grants.GetGroupGrantSlotsAsync(Arg.Any<IReadOnlyCollection<ClusterId>>(), Arg.Any<CancellationToken>())
            .Returns(call =>
            {
                var ids = call.Arg<IReadOnlyCollection<ClusterId>>();
                return _slots.Where(s => ids.Contains(s.ClusterId)).ToLookup(s => s.ClusterId, s => s.Slot);
            });
        _grants.Add(Arg.Do<Grant>(_added.Add));
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Create_adds_group_grant_with_priority()
    {
        var result = await CreateHandler().Handle(new CreateGroupGrantCommand("sre", "prod-eu-1", _prodView.Id.Value, AccessMode.ReadWrite, 500), Ct);

        result.IsSuccess.ShouldBeTrue();
        var grant = _added.ShouldHaveSingleItem();
        grant.Id.Value.ShouldBe(result.Value);
        grant.SubjectKind.ShouldBe(GrantSubjectKind.Group);
        grant.GroupName.ShouldBe(_sre);
        grant.Priority.ShouldBe(500);
        grant.GrantedBy.ShouldBe("root");
        grant.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<GrantCreated>();
    }

    [Fact]
    public async Task Create_reports_unknown_references_and_foreign_credential_as_field_errors()
    {
        var unknown = await CreateHandler().Handle(new CreateGroupGrantCommand("sre", "nope", Guid.NewGuid(), AccessMode.ReadOnly, 1), Ct);
        var foreign = await CreateHandler().Handle(new CreateGroupGrantCommand("sre", "prod-eu-1", _stageView.Id.Value, AccessMode.ReadOnly, 1), Ct);

        var errors = unknown.Error.ShouldBeOfType<ValidationError>().Errors;
        errors["ClusterName"].ShouldBe(["Cluster nope doesn't exist."]);
        errors["CredentialId"].ShouldBe(["Credential doesn't exist."]);
        foreign.Error.ShouldBeOfType<ValidationError>().Errors["CredentialId"].ShouldBe(["This credential belongs to another cluster."]);
        _added.ShouldBeEmpty();
    }

    [Fact]
    public async Task Create_with_taken_priority_or_existing_group_grant_is_conflict()
    {
        _slots.Add((_prod.Id, new GroupGrantSlot(GroupName.Create("platform").Value, 100)));
        _slots.Add((_prod.Id, new GroupGrantSlot(_sre, 200)));

        var taken = await CreateHandler().Handle(new CreateGroupGrantCommand("dev", "prod-eu-1", _prodView.Id.Value, AccessMode.ReadOnly, 100), Ct);
        var again = await CreateHandler().Handle(new CreateGroupGrantCommand("sre", "prod-eu-1", _prodView.Id.Value, AccessMode.ReadOnly, 300), Ct);

        taken.Error.ShouldNotBeNull().Code.ShouldBe("Grants.PriorityTaken");
        taken.Error!.Type.ShouldBe(ErrorType.Conflict);
        taken.Error.Message.ShouldBe("Priority 100 is already used by group `platform` on this cluster.");
        again.Error.ShouldNotBeNull().Code.ShouldBe("Grants.AlreadyExists");
        again.Error!.Message.ShouldBe("Group \"sre\" already has access to \"prod-eu-1\".");
        _added.ShouldBeEmpty();
    }

    [Fact]
    public async Task Bulk_adds_one_group_grant_per_item_with_one_slot_query()
    {
        var result = await BulkHandler().Handle(
            new BulkGroupGrantCommand("sre", AccessMode.ReadOnly, 10, [new("stage-eu-1", _stageView.Id.Value), new("prod-eu-1", _prodView.Id.Value)]),
            Ct);

        result.IsSuccess.ShouldBeTrue();
        result.Value.ShouldBe(_added.Select(g => g.Id.Value).ToList());
        _added.Select(g => g.ClusterId).ShouldBe([_stage.Id, _prod.Id]);
        _added.ShouldAllBe(g => g.Priority == 10 && g.SubjectKind == GrantSubjectKind.Group);
        await _grants.Received(1).GetGroupGrantSlotsAsync(Arg.Any<IReadOnlyCollection<ClusterId>>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Bulk_reports_every_failing_item_on_its_cluster_or_credential_and_adds_nothing()
    {
        _slots.Add((_prod.Id, new GroupGrantSlot(GroupName.Create("platform").Value, 10))); // priority taken on prod
        _slots.Add((_stage.Id, new GroupGrantSlot(_sre, 99))); // sre already granted on stage
        var dev = NewCluster("dev-eu-1");
        _clusters.Clusters.Add(dev);
        BulkGrantItem[] items =
        [
            new("prod-eu-1", _prodView.Id.Value),
            new("stage-eu-1", _stageView.Id.Value),
            new("dev-eu-1", _prodView.Id.Value), // credential of another cluster
            new("missing-1", _prodView.Id.Value),
        ];

        var result = await BulkHandler().Handle(new BulkGroupGrantCommand("sre", AccessMode.ReadOnly, 10, items), Ct);

        var errors = result.Error.ShouldBeOfType<ValidationError>().Errors;
        errors.Keys.ShouldBe(["Items[0].ClusterName", "Items[1].ClusterName", "Items[2].CredentialId", "Items[3].ClusterName"], ignoreOrder: true);
        errors["Items[0].ClusterName"].ShouldBe(["Priority 10 is already used by group `platform` on this cluster."]);
        errors["Items[1].ClusterName"].ShouldBe(["Group \"sre\" already has access to \"stage-eu-1\"."]);
        errors["Items[2].CredentialId"].ShouldBe(["This credential belongs to another cluster."]);
        errors["Items[3].ClusterName"].ShouldBe(["Cluster missing-1 doesn't exist."]);
        _added.ShouldBeEmpty();
    }

    [Fact]
    public async Task Update_changes_group_grant_priority_ignoring_its_own_slot()
    {
        var grant = ExistingGroupGrant(priority: 50);
        _slots.Add((_prod.Id, new GroupGrantSlot(_sre, 50)));

        var result = await UpdateHandler().Handle(new UpdateGrantCommand(grant.Id.Value, AccessMode.ReadOnly, _prodView.Id.Value, grant.Version, 60), Ct);

        result.IsSuccess.ShouldBeTrue();
        grant.Priority.ShouldBe(60);
        var changed = grant.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<GrantChanged>();
        changed.OldPriority.ShouldBe(50);
        changed.NewPriority.ShouldBe(60);
        changed.SubjectName.ShouldBe("sre");
    }

    [Fact]
    public async Task Update_group_grant_to_taken_priority_is_conflict_and_without_priority_is_field_error()
    {
        var grant = ExistingGroupGrant(priority: 50);
        _slots.Add((_prod.Id, new GroupGrantSlot(GroupName.Create("platform").Value, 70)));

        var taken = await UpdateHandler().Handle(new UpdateGrantCommand(grant.Id.Value, AccessMode.ReadOnly, _prodView.Id.Value, grant.Version, 70), Ct);
        var missing = await UpdateHandler().Handle(new UpdateGrantCommand(grant.Id.Value, AccessMode.ReadOnly, _prodView.Id.Value, grant.Version), Ct);

        taken.Error.ShouldNotBeNull().Code.ShouldBe("Grants.PriorityTaken");
        missing.Error.ShouldBeOfType<ValidationError>().Errors["Priority"].ShouldBe(["Priority must be between 1 and 1000."]);
        grant.Priority.ShouldBe(50);
        grant.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public async Task Update_user_grant_with_priority_is_field_error()
    {
        var alice = AuthTestUsers.PreCreated("alice");
        _users.Users.Add(alice);
        var grant = Grant.Create(alice, _prod, _prodView, AccessMode.ReadOnly, new HashSet<ClusterId>(), "admin", FixedClock.Now).Value;
        grant.ClearDomainEvents();
        _grants.GetByIdAsync(grant.Id, Arg.Any<CancellationToken>()).Returns(grant);

        var result = await UpdateHandler().Handle(new UpdateGrantCommand(grant.Id.Value, AccessMode.ReadWrite, _prodView.Id.Value, grant.Version, 5), Ct);

        result.Error.ShouldBeOfType<ValidationError>().Errors["Priority"].ShouldBe(["Priority applies to group grants only."]);
        grant.AccessMode.ShouldBe(AccessMode.ReadOnly);
    }

    private CreateGroupGrantHandler CreateHandler() =>
        new(_clusters, _credentials, _grants, FakeCurrentUser.SignedIn(UserRole.Admin, username: "root"), new FixedClock());

    private BulkGroupGrantHandler BulkHandler() =>
        new(_clusters, _credentials, _grants, FakeCurrentUser.SignedIn(UserRole.Admin, username: "root"), new FixedClock());

    private UpdateGrantHandler UpdateHandler() =>
        new(_grants, _users, _clusters, _credentials, FakeCurrentUser.SignedIn(UserRole.Admin, username: "root"), new FixedClock());

    // A stored read-only grant of group sre on prod-eu-1 that the substituted repository returns by id.
    private Grant ExistingGroupGrant(int priority)
    {
        var grant = Grant.CreateForGroup(_sre, _prod, _prodView, AccessMode.ReadOnly, priority, [], "admin", FixedClock.Now).Value;
        grant.ClearDomainEvents();
        _grants.GetByIdAsync(grant.Id, Arg.Any<CancellationToken>()).Returns(grant);
        return grant;
    }

    private static Cluster NewCluster(string name)
    {
        var cluster = TestClusters.Create(name);
        cluster.ClearDomainEvents();
        return cluster;
    }

    private Credential NewCredential(Cluster cluster, string name)
    {
        var credential = Credential.Add(
            cluster,
            CredentialName.Create(name).Value,
            null,
            new EncryptedToken([9]),
            TokenFingerprint.Create("0123abcd").Value,
            TokenMetadata.Opaque,
            InspectNamespaces.Empty,
            "admin",
            FixedClock.Now);
        credential.ClearDomainEvents();
        _credentials.GetByIdAsync(credential.Id, Arg.Any<CancellationToken>()).Returns(credential);
        return credential;
    }
}
