using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Grants.BulkGrant;
using FleetConsole.Application.Grants.CreateGrant;
using FleetConsole.Application.Grants.RevokeGrant;
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
/// The grant command handlers over in-memory/substituted repositories: body references as field errors (contract §9.3),
/// 409 on a second grant, the all-or-nothing bulk with every item error reported (§9.4), the version check and the audit
/// labels of change/revoke. Validation, the read-only guard and the commit are covered by behavior and integration tests.
/// </summary>
public sealed class GrantCommandHandlerTests
{
    private readonly InMemoryUserRepository _users = new();
    private readonly InMemoryClusterRepository _clusters = new();
    private readonly ICredentialRepository _credentials = Substitute.For<ICredentialRepository>();
    private readonly IGrantRepository _grants = Substitute.For<IGrantRepository>();
    private readonly List<Grant> _added = [];
    private readonly User _alice = AuthTestUsers.PreCreated("alice");
    private readonly Cluster _prod = NewCluster("prod-eu-1");
    private readonly Cluster _stage = NewCluster("stage-eu-1");
    private readonly Credential _prodView;
    private readonly Credential _prodEdit;
    private readonly Credential _stageView;

    public GrantCommandHandlerTests()
    {
        _users.Users.Add(_alice);
        _clusters.Clusters.AddRange([_prod, _stage]);
        _prodView = NewCredential(_prod, "fleet-view");
        _prodEdit = NewCredential(_prod, "fleet-edit");
        _stageView = NewCredential(_stage, "fleet-view");
        Credential[] all = [_prodView, _prodEdit, _stageView];
        _credentials.GetByIdsAsync(Arg.Any<IReadOnlyCollection<CredentialId>>(), Arg.Any<CancellationToken>())
            .Returns(call => all.Where(c => call.Arg<IReadOnlyCollection<CredentialId>>().Contains(c.Id)).ToList());
        _grants.GetClusterIdsForUserAsync(Arg.Any<UserId>(), Arg.Any<CancellationToken>())
            .Returns(new HashSet<ClusterId>());
        _grants.Add(Arg.Do<Grant>(_added.Add));
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Create_adds_grant_and_returns_its_id()
    {
        var result = await CreateHandler().Handle(new CreateGrantCommand("alice", "prod-eu-1", _prodView.Id.Value, AccessMode.ReadWrite), Ct);

        result.IsSuccess.ShouldBeTrue();
        var grant = _added.ShouldHaveSingleItem();
        grant.Id.Value.ShouldBe(result.Value);
        grant.AccessMode.ShouldBe(AccessMode.ReadWrite);
        grant.GrantedBy.ShouldBe("root");
        grant.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<GrantCreated>();
    }

    [Fact]
    public async Task Create_reports_every_unknown_reference_as_field_error()
    {
        var result = await CreateHandler().Handle(new CreateGrantCommand("bob", "nope", Guid.NewGuid(), AccessMode.ReadOnly), Ct);

        var errors = result.Error.ShouldBeOfType<ValidationError>().Errors;
        errors["Username"].ShouldBe(["User bob doesn't exist."]);
        errors["ClusterName"].ShouldBe(["Cluster nope doesn't exist."]);
        errors["CredentialId"].ShouldBe(["Credential doesn't exist."]);
        _added.ShouldBeEmpty();
    }

    [Fact]
    public async Task Create_with_credential_of_another_cluster_is_field_error_on_credentialId()
    {
        var result = await CreateHandler().Handle(new CreateGrantCommand("alice", "prod-eu-1", _stageView.Id.Value, AccessMode.ReadOnly), Ct);

        result.Error.ShouldBeOfType<ValidationError>().Errors["CredentialId"]
            .ShouldBe(["This credential belongs to another cluster."]);
        _added.ShouldBeEmpty();
    }

    [Fact]
    public async Task Create_second_grant_is_AlreadyExists_conflict()
    {
        _grants.GetClusterIdsForUserAsync(_alice.Id, Arg.Any<CancellationToken>()).Returns(new HashSet<ClusterId> { _prod.Id });

        var result = await CreateHandler().Handle(new CreateGrantCommand("alice", "prod-eu-1", _prodView.Id.Value, AccessMode.ReadOnly), Ct);

        var error = result.Error.ShouldNotBeNull();
        error.Code.ShouldBe("Grants.AlreadyExists");
        error.Type.ShouldBe(ErrorType.Conflict);
        _added.ShouldBeEmpty();
    }

    [Fact]
    public async Task Bulk_adds_one_grant_per_item_in_request_order()
    {
        var result = await BulkHandler().Handle(
            new BulkGrantCommand("alice", AccessMode.ReadOnly, [new("stage-eu-1", _stageView.Id.Value), new("prod-eu-1", _prodView.Id.Value)]),
            Ct);

        result.IsSuccess.ShouldBeTrue();
        result.Value.ShouldBe(_added.Select(g => g.Id.Value).ToList());
        _added.Select(g => g.ClusterId).ShouldBe([_stage.Id, _prod.Id]);
        _added.ShouldAllBe(g => g.DomainEvents.Count == 1);
    }

    [Fact]
    public async Task Bulk_reports_all_item_errors_by_index_and_adds_nothing()
    {
        _grants.GetClusterIdsForUserAsync(_alice.Id, Arg.Any<CancellationToken>()).Returns(new HashSet<ClusterId> { _stage.Id });
        BulkGrantItem[] items =
        [
            new("prod-eu-1", _prodView.Id.Value), // fine
            new("missing-1", _prodView.Id.Value), // unknown cluster
            new("prod-eu-2", Guid.NewGuid()), // unknown cluster and credential
            new("stage-eu-1", _stageView.Id.Value), // already granted
        ];
        _clusters.Clusters.Add(NewCluster("prod-eu-2"));

        var result = await BulkHandler().Handle(new BulkGrantCommand("alice", AccessMode.ReadOnly, items), Ct);

        var errors = result.Error.ShouldBeOfType<ValidationError>().Errors;
        errors.Keys.ShouldBe(["Items[1].ClusterName", "Items[2].CredentialId", "Items[3].ClusterName"], ignoreOrder: true);
        errors["Items[1].ClusterName"].ShouldBe(["Cluster missing-1 doesn't exist."]);
        errors["Items[2].CredentialId"].ShouldBe(["Credential doesn't exist."]);
        errors["Items[3].ClusterName"].ShouldBe(["alice already has access to stage-eu-1."]);
        _added.ShouldBeEmpty();
    }

    [Fact]
    public async Task Bulk_with_credential_of_another_cluster_is_item_field_error()
    {
        var result = await BulkHandler().Handle(
            new BulkGrantCommand("alice", AccessMode.ReadOnly, [new("prod-eu-1", _stageView.Id.Value)]), Ct);

        result.Error.ShouldBeOfType<ValidationError>().Errors["Items[0].CredentialId"]
            .ShouldBe(["This credential belongs to another cluster."]);
        _added.ShouldBeEmpty();
    }

    [Fact]
    public async Task Bulk_for_unknown_user_is_Users_NotFound()
    {
        var result = await BulkHandler().Handle(
            new BulkGrantCommand("nobody", AccessMode.ReadOnly, [new("prod-eu-1", _prodView.Id.Value)]), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Users.NotFound");
    }

    [Fact]
    public async Task Update_changes_mode_and_credential_with_old_credential_in_event()
    {
        var grant = Existing(_prodView);

        var result = await UpdateHandler().Handle(new UpdateGrantCommand(grant.Id.Value, AccessMode.ReadWrite, _prodEdit.Id.Value, grant.Version), Ct);

        result.IsSuccess.ShouldBeTrue();
        grant.CredentialId.ShouldBe(_prodEdit.Id);
        grant.UpdatedBy.ShouldBe("root");
        var changed = grant.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<GrantChanged>();
        changed.OldCredentialName.ShouldBe("fleet-view");
        changed.NewCredentialName.ShouldBe("fleet-edit");
        changed.SubjectName.ShouldBe("alice");
        changed.ClusterName.ShouldBe("prod-eu-1");
    }

    [Fact]
    public async Task Update_with_stale_version_is_Concurrency_Conflict()
    {
        var grant = Existing(_prodView);

        var result = await UpdateHandler().Handle(new UpdateGrantCommand(grant.Id.Value, AccessMode.ReadWrite, _prodView.Id.Value, grant.Version + 1), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Concurrency.Conflict");
        grant.AccessMode.ShouldBe(AccessMode.ReadOnly);
    }

    [Fact]
    public async Task Update_to_credential_of_another_cluster_or_unknown_is_field_error()
    {
        var grant = Existing(_prodView);

        var other = await UpdateHandler().Handle(new UpdateGrantCommand(grant.Id.Value, AccessMode.ReadOnly, _stageView.Id.Value, grant.Version), Ct);
        var unknown = await UpdateHandler().Handle(new UpdateGrantCommand(grant.Id.Value, AccessMode.ReadOnly, Guid.NewGuid(), grant.Version), Ct);

        other.Error.ShouldBeOfType<ValidationError>().Errors["CredentialId"].ShouldBe(["This credential belongs to another cluster."]);
        unknown.Error.ShouldBeOfType<ValidationError>().Errors["CredentialId"].ShouldBe(["Credential doesn't exist."]);
        grant.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public async Task Update_and_revoke_of_unknown_grant_are_Grants_NotFound()
    {
        var update = await UpdateHandler().Handle(new UpdateGrantCommand(Guid.NewGuid(), AccessMode.ReadOnly, _prodView.Id.Value, 0), Ct);
        var revoke = await RevokeHandler().Handle(new RevokeGrantCommand(Guid.NewGuid()), Ct);

        update.Error.ShouldNotBeNull().Code.ShouldBe("Grants.NotFound");
        revoke.Error.ShouldNotBeNull().Code.ShouldBe("Grants.NotFound");
    }

    [Fact]
    public async Task Revoke_raises_event_with_labels_and_removes_grant()
    {
        var grant = Existing(_prodView);

        var result = await RevokeHandler().Handle(new RevokeGrantCommand(grant.Id.Value), Ct);

        result.IsSuccess.ShouldBeTrue();
        _grants.Received(1).Remove(grant);
        var revoked = grant.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<GrantRevoked>();
        revoked.SubjectName.ShouldBe("alice");
        revoked.ClusterName.ShouldBe("prod-eu-1");
        revoked.CredentialName.ShouldBe("fleet-view");
    }

    private CreateGrantHandler CreateHandler() =>
        new(_users, _clusters, _credentials, _grants, FakeCurrentUser.SignedIn(UserRole.Admin, username: "root"), new FixedClock());

    private BulkGrantHandler BulkHandler() =>
        new(_users, _clusters, _credentials, _grants, FakeCurrentUser.SignedIn(UserRole.Admin, username: "root"), new FixedClock());

    private UpdateGrantHandler UpdateHandler() =>
        new(_grants, _users, _clusters, _credentials, FakeCurrentUser.SignedIn(UserRole.Admin, username: "root"), new FixedClock());

    private RevokeGrantHandler RevokeHandler() => new(_grants, _users, _clusters, _credentials);

    // A stored read-only grant of alice on prod-eu-1 that the substituted repository returns by id.
    private Grant Existing(Credential credential)
    {
        var grant = Grant.Create(_alice, _prod, credential, AccessMode.ReadOnly, new HashSet<ClusterId>(), "admin", FixedClock.Now).Value;
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
