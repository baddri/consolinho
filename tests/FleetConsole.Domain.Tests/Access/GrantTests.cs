using System.Runtime.CompilerServices;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Access.Events;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using static FleetConsole.Domain.Tests.DomainTestData;

namespace FleetConsole.Domain.Tests.Access;

public sealed class GrantTests
{
    private static readonly DateTimeOffset Later = Now.AddDays(1);
    private static readonly HashSet<ClusterId> NoGrants = [];

    private readonly User _alice = NewUser("alice");
    private readonly Cluster _prod = NewCluster("prod-eu-1");
    private readonly Cluster _dev = NewCluster("dev-1");

    // ---- create (GRANT-1/2) -----------------------------------------------------------------------------------------

    [Fact]
    public void Create_SetsState_AndRaisesGrantCreated()
    {
        var credential = NewCredential(_prod, "fleet-view");

        var result = Grant.Create(_alice, _prod, credential, AccessMode.ReadWrite, NoGrants, "admin", Now);

        var grant = result.Value;
        grant.Id.Value.ShouldNotBe(Guid.Empty);
        grant.UserId.ShouldBe(_alice.Id);
        grant.ClusterId.ShouldBe(_prod.Id);
        grant.CredentialId.ShouldBe(credential.Id);
        grant.AccessMode.ShouldBe(AccessMode.ReadWrite);
        grant.GrantedAt.ShouldBe(Now);
        grant.GrantedBy.ShouldBe("admin");
        grant.UpdatedAt.ShouldBeNull();
        grant.UpdatedBy.ShouldBeNull();
        grant.DomainEvents.ShouldBe([
            new GrantCreated(grant.Id, _alice.Id, "alice", _prod.Id, "prod-eu-1", credential.Id, "fleet-view", AccessMode.ReadWrite),
        ]);
    }

    [Fact]
    public void AccessMode_DefaultValue_IsReadOnly()
    {
        default(AccessMode).ShouldBe(AccessMode.ReadOnly);
    }

    [Fact]
    public void Create_SecondGrantForSameUserAndCluster_FailsWithAlreadyExists()
    {
        var credential = NewCredential(_prod);

        var result = Grant.Create(_alice, _prod, credential, AccessMode.ReadOnly, new HashSet<ClusterId> { _dev.Id, _prod.Id },
            "admin", Now);

        result.Error.ShouldBe(new Error(
            "Grants.AlreadyExists",
            "alice already has access to prod-eu-1 — change the existing grant instead.",
            ErrorType.Conflict));
    }

    [Fact]
    public void Create_WhenUserHasGrantsOnOtherClustersOnly_Succeeds()
    {
        var result = Grant.Create(_alice, _prod, NewCredential(_prod), AccessMode.ReadOnly,
            new HashSet<ClusterId> { _dev.Id }, "admin", Now);

        result.IsSuccess.ShouldBeTrue();
    }

    [Fact]
    public void Create_WithCredentialOfAnotherCluster_FailsWithCredentialNotInCluster()
    {
        var foreignCredential = NewCredential(_dev);

        var result = Grant.Create(_alice, _prod, foreignCredential, AccessMode.ReadOnly, NoGrants, "admin", Now);

        result.Error.ShouldBe(new Error(
            "Grants.CredentialNotInCluster", "This credential belongs to another cluster.", ErrorType.Validation));
    }

    [Fact]
    public void Create_ChecksCredentialBeforeExistingGrant()
    {
        var result = Grant.Create(_alice, _prod, NewCredential(_dev), AccessMode.ReadOnly,
            new HashSet<ClusterId> { _prod.Id }, "admin", Now);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Grants.CredentialNotInCluster");
    }

    [Fact]
    public void Create_ForDeactivatedUserAndDisabledCluster_IsAllowed()
    {
        var user = NewUser("bob");
        user.Deactivate(UserId.New(), activeWritableAdminCount: 1).IsSuccess.ShouldBeTrue();
        var disabled = NewCluster("old-1", isEnabled: false);

        var result = Grant.Create(user, disabled, NewCredential(disabled), AccessMode.ReadOnly, NoGrants, "admin", Now);

        result.IsSuccess.ShouldBeTrue();
    }

    [Fact]
    public void Create_GuardsArguments()
    {
        var credential = NewCredential(_prod);

        Should.Throw<ArgumentOutOfRangeException>(() =>
            Grant.Create(_alice, _prod, credential, (AccessMode)5, NoGrants, "admin", Now));
        Should.Throw<ArgumentException>(() =>
            Grant.Create(_alice, _prod, credential, AccessMode.ReadOnly, NoGrants, "", Now));
        Should.Throw<ArgumentException>(() =>
            Grant.Create(_alice, _prod, credential, AccessMode.ReadOnly, NoGrants, "admin", default));
        Should.Throw<ArgumentNullException>(() =>
            Grant.Create(_alice, _prod, credential, AccessMode.ReadOnly, null!, "admin", Now));
    }

    [Theory]
    [InlineData(nameof(Grant.UserId))]
    [InlineData(nameof(Grant.ClusterId))]
    public void UserAndCluster_AreInitOnly(string propertyName)
    {
        var setter = typeof(Grant).GetProperty(propertyName)!.SetMethod.ShouldNotBeNull();

        setter.IsPublic.ShouldBeFalse();
        setter.ReturnParameter.GetRequiredCustomModifiers().ShouldContain(typeof(IsExternalInit));
    }

    // ---- change (GRANT-3) -------------------------------------------------------------------------------------------

    [Fact]
    public void Change_ModeOnly_RaisesGrantChanged()
    {
        var (grant, view) = ReadOnlyGrant();

        var result = grant.Change(AccessMode.ReadWrite, view, Labels("fleet-view"), "bob", Later);

        result.IsSuccess.ShouldBeTrue();
        grant.AccessMode.ShouldBe(AccessMode.ReadWrite);
        grant.CredentialId.ShouldBe(view.Id);
        grant.UpdatedAt.ShouldBe(Later);
        grant.UpdatedBy.ShouldBe("bob");
        grant.DomainEvents.ShouldBe([
            new GrantChanged(grant.Id, _alice.Id, "alice", _prod.Id, "prod-eu-1",
                AccessMode.ReadOnly, AccessMode.ReadWrite, view.Id, "fleet-view", view.Id, "fleet-view"),
        ]);
    }

    [Fact]
    public void Change_CredentialOnly_RaisesGrantChangedWithOldAndNewNames()
    {
        var (grant, view) = ReadOnlyGrant();
        var edit = NewCredential(_prod, "fleet-edit");

        grant.Change(AccessMode.ReadOnly, edit, Labels("fleet-view"), "bob", Later).IsSuccess.ShouldBeTrue();

        grant.CredentialId.ShouldBe(edit.Id);
        grant.DomainEvents.ShouldBe([
            new GrantChanged(grant.Id, _alice.Id, "alice", _prod.Id, "prod-eu-1",
                AccessMode.ReadOnly, AccessMode.ReadOnly, view.Id, "fleet-view", edit.Id, "fleet-edit"),
        ]);
    }

    [Fact]
    public void Change_ToCurrentValues_IsNoOp_WithoutEvent()
    {
        var (grant, view) = ReadOnlyGrant();

        grant.Change(AccessMode.ReadOnly, view, Labels("fleet-view"), "bob", Later).IsSuccess.ShouldBeTrue();

        grant.DomainEvents.ShouldBeEmpty();
        grant.UpdatedAt.ShouldBeNull();
        grant.UpdatedBy.ShouldBeNull();
    }

    [Fact]
    public void Change_ToCredentialOfAnotherCluster_FailsAndChangesNothing()
    {
        var (grant, view) = ReadOnlyGrant();

        var result = grant.Change(AccessMode.ReadWrite, NewCredential(_dev), Labels("fleet-view"), "bob", Later);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Grants.CredentialNotInCluster");
        grant.AccessMode.ShouldBe(AccessMode.ReadOnly);
        grant.CredentialId.ShouldBe(view.Id);
        grant.UpdatedAt.ShouldBeNull();
        grant.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void Change_GuardsArguments()
    {
        var (grant, view) = ReadOnlyGrant();

        Should.Throw<ArgumentOutOfRangeException>(() => grant.Change((AccessMode)3, view, Labels("fleet-view"), "bob", Later));
        Should.Throw<ArgumentException>(() => grant.Change(AccessMode.ReadWrite, view, Labels("fleet-view"), " ", Later));
        Should.Throw<ArgumentNullException>(() => grant.Change(AccessMode.ReadWrite, view, null!, "bob", Later));
    }

    // ---- revoke (GRANT-3) -------------------------------------------------------------------------------------------

    [Fact]
    public void Revoke_RaisesGrantRevokedWithCurrentState()
    {
        var (grant, view) = ReadOnlyGrant();

        grant.Revoke(Labels("fleet-view"));

        grant.DomainEvents.ShouldBe([
            new GrantRevoked(grant.Id, _alice.Id, "alice", _prod.Id, "prod-eu-1", view.Id, "fleet-view", AccessMode.ReadOnly),
        ]);
    }

    // ---- errors (contract §2) ---------------------------------------------------------------------------------------

    [Fact]
    public void NotFound_HasContractCode()
    {
        GrantErrors.NotFound().Code.ShouldBe("Grants.NotFound");
        GrantErrors.NotFound().Type.ShouldBe(ErrorType.NotFound);
    }

    private (Grant Grant, Credential Credential) ReadOnlyGrant()
    {
        var credential = NewCredential(_prod, "fleet-view");
        var grant = Grant.Create(_alice, _prod, credential, AccessMode.ReadOnly, NoGrants, "admin", Now).Value;
        grant.ClearDomainEvents();
        return (grant, credential);
    }

    private static GrantLabels Labels(string credentialName) => new("alice", "prod-eu-1", credentialName);
}
