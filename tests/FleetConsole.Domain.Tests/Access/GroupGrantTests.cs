using FleetConsole.Domain.Access;
using FleetConsole.Domain.Access.Events;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using static FleetConsole.Domain.Tests.DomainTestData;

namespace FleetConsole.Domain.Tests.Access;

public sealed class GroupGrantTests
{
    private static readonly DateTimeOffset Later = Now.AddDays(1);
    private static readonly GroupGrantSlot[] NoSlots = [];

    private readonly Cluster _prod = NewCluster("prod-eu-1");
    private readonly Cluster _dev = NewCluster("dev-1");
    private readonly GroupName _sre = Group("sre-emea");

    // ---- create (GRP-1..6) ------------------------------------------------------------------------------------------

    [Fact]
    public void CreateForGroup_SetsGroupShape_AndRaisesGrantCreated()
    {
        var credential = NewCredential(_prod);

        var grant = CreateForGroup(credential, 50, NoSlots).Value;

        grant.SubjectKind.ShouldBe(GrantSubjectKind.Group);
        grant.UserId.ShouldBeNull();
        grant.GroupName.ShouldBe(_sre);
        grant.Priority.ShouldBe(50);
        grant.ClusterId.ShouldBe(_prod.Id);
        grant.CredentialId.ShouldBe(credential.Id);
        grant.DomainEvents.ShouldBe([
            new GrantCreated(grant.Id, null, "sre-emea", _prod.Id, "prod-eu-1", credential.Id, "fleet-view",
                AccessMode.ReadOnly, GrantSubjectKind.Group, 50),
        ]);
    }

    [Fact]
    public void UserGrant_HasUserShape()
    {
        var grant = Grant.Create(NewUser(), _prod, NewCredential(_prod), AccessMode.ReadOnly, new HashSet<ClusterId>(), "admin", Now).Value;

        grant.SubjectKind.ShouldBe(GrantSubjectKind.User);
        grant.UserId.ShouldNotBeNull();
        grant.GroupName.ShouldBeNull();
        grant.Priority.ShouldBeNull();
    }

    [Theory]
    [InlineData(1)]
    [InlineData(1000)]
    public void CreateForGroup_AcceptsPriorityBounds(int priority) =>
        CreateForGroup(NewCredential(_prod), priority, NoSlots).IsSuccess.ShouldBeTrue();

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(1001)]
    public void CreateForGroup_RefusesPriorityOutOfRange(int priority)
    {
        var error = CreateForGroup(NewCredential(_prod), priority, NoSlots).Error!;

        error.Code.ShouldBe("Grants.PriorityOutOfRange");
        error.Type.ShouldBe(ErrorType.Validation);
    }

    [Fact]
    public void CreateForGroup_ErrorOrder_CredentialBeforePriorityRange()
    {
        var foreign = NewCredential(_dev);

        CreateForGroup(foreign, 0, [new GroupGrantSlot(_sre, 0)]).Error!.Code.ShouldBe("Grants.CredentialNotInCluster");
    }

    [Fact]
    public void CreateForGroup_ErrorOrder_PriorityRangeBeforeConflicts() =>
        CreateForGroup(NewCredential(_prod), 2000, [new GroupGrantSlot(_sre, 2000)]).Error!.Code
            .ShouldBe("Grants.PriorityOutOfRange");

    [Fact]
    public void CreateForGroup_ErrorOrder_GroupExistsBeforePriorityTaken()
    {
        var error = CreateForGroup(NewCredential(_prod), 50, [new GroupGrantSlot(_sre, 50)]).Error!;

        error.Code.ShouldBe("Grants.AlreadyExists");
        error.Type.ShouldBe(ErrorType.Conflict);
        error.Message.ShouldBe("Group \"sre-emea\" already has access to \"prod-eu-1\".");
    }

    [Fact]
    public void CreateForGroup_RefusesTakenPriority_NamingTheOtherGroup()
    {
        var error = CreateForGroup(NewCredential(_prod), 50, [new GroupGrantSlot(Group("ops"), 50)]).Error!;

        error.Code.ShouldBe("Grants.PriorityTaken");
        error.Type.ShouldBe(ErrorType.Conflict);
        error.Message.ShouldBe("Priority 50 is already used by group `ops` on this cluster.");
    }

    [Fact]
    public void CreateForGroup_GroupMatchIsCaseSensitive() =>
        CreateForGroup(NewCredential(_prod), 50, [new GroupGrantSlot(Group("SRE-EMEA"), 10)]).IsSuccess.ShouldBeTrue();

    // ---- change (GRANT-3, GRP-4) ------------------------------------------------------------------------------------

    [Fact]
    public void ChangeGroupGrant_PriorityOnly_RaisesGrantChanged()
    {
        var (grant, view) = GroupGrant(50);

        grant.ChangeGroupGrant(AccessMode.ReadOnly, view, 60, NoSlots, Labels(), "bob", Later).IsSuccess.ShouldBeTrue();

        grant.Priority.ShouldBe(60);
        grant.UpdatedBy.ShouldBe("bob");
        grant.UpdatedAt.ShouldBe(Later);
        grant.DomainEvents.ShouldBe([
            new GrantChanged(grant.Id, null, "sre-emea", _prod.Id, "prod-eu-1", AccessMode.ReadOnly, AccessMode.ReadOnly,
                view.Id, "fleet-view", view.Id, "fleet-view", GrantSubjectKind.Group, 50, 60),
        ]);
    }

    [Fact]
    public void ChangeGroupGrant_NothingChanged_IsNoOp()
    {
        var (grant, view) = GroupGrant(50);

        grant.ChangeGroupGrant(AccessMode.ReadOnly, view, 50, NoSlots, Labels(), "bob", Later).IsSuccess.ShouldBeTrue();

        grant.DomainEvents.ShouldBeEmpty();
        grant.UpdatedAt.ShouldBeNull();
    }

    [Fact]
    public void ChangeGroupGrant_IgnoresItsOwnSlot()
    {
        var (grant, view) = GroupGrant(50);

        grant.ChangeGroupGrant(AccessMode.ReadWrite, view, 50, [new GroupGrantSlot(_sre, 50)], Labels(), "bob", Later)
            .IsSuccess.ShouldBeTrue();

        grant.AccessMode.ShouldBe(AccessMode.ReadWrite);
    }

    [Fact]
    public void ChangeGroupGrant_RefusesTakenPriority_NamingTheOtherGroup()
    {
        var (grant, view) = GroupGrant(50);

        var error = grant.ChangeGroupGrant(AccessMode.ReadOnly, view, 70, [new GroupGrantSlot(Group("ops"), 70)], Labels(), "bob", Later).Error!;

        error.Message.ShouldBe("Priority 70 is already used by group `ops` on this cluster.");
        grant.Priority.ShouldBe(50);
        grant.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void ChangeGroupGrant_ErrorOrder()
    {
        var (grant, _) = GroupGrant(50);
        var foreign = NewCredential(_dev);
        var view = NewCredential(_prod);

        grant.ChangeGroupGrant(AccessMode.ReadOnly, foreign, 0, NoSlots, Labels(), "bob", Later).Error!.Code
            .ShouldBe("Grants.CredentialNotInCluster");
        grant.ChangeGroupGrant(AccessMode.ReadOnly, view, 0, [new GroupGrantSlot(Group("ops"), 0)], Labels(), "bob", Later).Error!.Code
            .ShouldBe("Grants.PriorityOutOfRange");
    }

    [Fact]
    public void Change_OnGroupGrant_Throws()
    {
        var (grant, view) = GroupGrant(50);

        Should.Throw<InvalidOperationException>(() => grant.Change(AccessMode.ReadWrite, view, Labels(), "bob", Later));
    }

    [Fact]
    public void ChangeGroupGrant_OnUserGrant_Throws()
    {
        var view = NewCredential(_prod);
        var grant = Grant.Create(NewUser(), _prod, view, AccessMode.ReadOnly, new HashSet<ClusterId>(), "admin", Now).Value;

        Should.Throw<InvalidOperationException>(() =>
            grant.ChangeGroupGrant(AccessMode.ReadWrite, view, 5, NoSlots, Labels(), "bob", Later));
    }

    // ---- revoke -----------------------------------------------------------------------------------------------------

    [Fact]
    public void Revoke_GroupGrant_CarriesKindAndPriority()
    {
        var (grant, view) = GroupGrant(50);

        grant.Revoke(Labels());

        grant.DomainEvents.ShouldBe([
            new GrantRevoked(grant.Id, null, "sre-emea", _prod.Id, "prod-eu-1", view.Id, "fleet-view", AccessMode.ReadOnly,
                GrantSubjectKind.Group, 50),
        ]);
    }

    private static GroupName Group(string name) => GroupName.Create(name).Value;

    private static GrantLabels Labels() => new("sre-emea", "prod-eu-1", "fleet-view");

    private Result<Grant> CreateForGroup(Credential credential, int priority, IReadOnlyCollection<GroupGrantSlot> slots) =>
        Grant.CreateForGroup(_sre, _prod, credential, AccessMode.ReadOnly, priority, slots, "admin", Now);

    private (Grant Grant, Credential Credential) GroupGrant(int priority)
    {
        var credential = NewCredential(_prod);
        var grant = CreateForGroup(credential, priority, NoSlots).Value;
        grant.ClearDomainEvents();
        return (grant, credential);
    }
}
