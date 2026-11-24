using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;
using FleetConsole.Domain.Users.Events;

namespace FleetConsole.Domain.Tests.Users;

public sealed class UserTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 18, 9, 30, 0, TimeSpan.Zero);
    private static readonly UserId OtherAdmin = UserId.New();

    // ---- creation ---------------------------------------------------------------------------------------------------

    [Fact]
    public void PreCreate_SetsState_AndRaisesUserCreated()
    {
        var user = User.PreCreate(Name("alice"), UserRole.Admin, isReadOnly: true, "bob", Now);

        user.Id.Value.ShouldNotBe(Guid.Empty);
        user.Username.Value.ShouldBe("alice");
        user.Role.ShouldBe(UserRole.Admin);
        user.IsAdminByAssignment.ShouldBeTrue();
        user.AdminConfigurationSource.ShouldBeNull();
        user.IsReadOnly.ShouldBeTrue();
        user.IsDeactivated.ShouldBeFalse();
        user.CreatedBy.ShouldBe("bob");
        user.CreatedAt.ShouldBe(Now);
        user.LastLoginAt.ShouldBeNull();
        user.Groups.ShouldBeEmpty();
        user.SecurityStamp.ShouldNotBe(Guid.Empty);
        user.Version.ShouldBe(0u);
        user.DomainEvents.ShouldBe([new UserCreated(user.Id, "alice", UserRole.Admin, true)]);
    }

    [Fact]
    public void PreCreate_RegularUser_IsNotAdmin()
    {
        var user = User.PreCreate(Name("alice"), UserRole.User, isReadOnly: false, "bob", Now);

        user.Role.ShouldBe(UserRole.User);
        user.IsAdminByAssignment.ShouldBeFalse();
    }

    [Fact]
    public void PreCreate_GuardsArguments()
    {
        Should.Throw<ArgumentException>(() => User.PreCreate(Name("alice"), UserRole.User, false, " ", Now));
        Should.Throw<ArgumentException>(() => User.PreCreate(Name("alice"), UserRole.User, false, "bob", default));
        Should.Throw<ArgumentOutOfRangeException>(() => User.PreCreate(Name("alice"), (UserRole)7, false, "bob", Now));
    }

    [Fact]
    public void Provision_CreatesRegularUser_CreatedByThemselves()
    {
        var user = User.Provision(Name("carol"), Now);

        user.Role.ShouldBe(UserRole.User);
        user.IsReadOnly.ShouldBeFalse();
        user.CreatedBy.ShouldBe("carol");
        user.CreatedAt.ShouldBe(Now);
        user.Status.ShouldBe(UserStatus.Pending);
        user.DomainEvents.ShouldBe([new UserProvisioned(user.Id, "carol")]);
    }

    [Fact]
    public void NewUsers_GetDistinctIdsAndStamps()
    {
        var a = User.Provision(Name("a"), Now);
        var b = User.Provision(Name("b"), Now);

        a.Id.ShouldNotBe(b.Id);
        a.SecurityStamp.ShouldNotBe(b.SecurityStamp);
    }

    // ---- status (USR-1) ---------------------------------------------------------------------------------------------

    [Fact]
    public void Status_IsPendingUntilFirstLogin_ThenActive()
    {
        var user = RegularUser();
        user.Status.ShouldBe(UserStatus.Pending);

        user.RecordLogin("Alice", [], null, provisioned: false, Now).IsSuccess.ShouldBeTrue();

        user.Status.ShouldBe(UserStatus.Active);
    }

    [Fact]
    public void Status_DeactivatedWins_EvenWhenNeverLoggedIn()
    {
        var pending = RegularUser();
        pending.Deactivate(OtherAdmin, 1).IsSuccess.ShouldBeTrue();
        pending.Status.ShouldBe(UserStatus.Deactivated);

        var active = LoggedInUser();
        active.Deactivate(OtherAdmin, 1).IsSuccess.ShouldBeTrue();
        active.Status.ShouldBe(UserStatus.Deactivated);
    }

    [Fact]
    public void Status_ReturnsToActiveOrPending_OnReactivation()
    {
        var active = LoggedInUser();
        active.Deactivate(OtherAdmin, 1);
        active.Reactivate();
        active.Status.ShouldBe(UserStatus.Active);

        var pending = RegularUser();
        pending.Deactivate(OtherAdmin, 1);
        pending.Reactivate();
        pending.Status.ShouldBe(UserStatus.Pending);
    }

    // ---- login (AUTH-5/7/8) -----------------------------------------------------------------------------------------

    [Fact]
    public void RecordLogin_UpdatesProfile_AndRaisesUserLoggedIn()
    {
        var user = RegularUser();

        var result = user.RecordLogin("Alice A.", ["devs", "ops"], null, provisioned: false, Now);

        result.IsSuccess.ShouldBeTrue();
        user.DisplayName.ShouldBe("Alice A.");
        user.Groups.ShouldBe(["devs", "ops"]);
        user.LastLoginAt.ShouldBe(Now);
        var loggedIn = user.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<UserLoggedIn>();
        loggedIn.UserId.ShouldBe(user.Id);
        loggedIn.Username.ShouldBe("alice");
        loggedIn.Groups.ShouldBe(["devs", "ops"]);
        loggedIn.Provisioned.ShouldBeFalse();
    }

    [Fact]
    public void RecordLogin_StoresBlankDisplayNameAsNull_AndCopiesGroups()
    {
        var user = RegularUser();
        var groups = new List<string> { "devs" };

        user.RecordLogin("  ", groups, null, provisioned: false, Now);
        groups.Add("later");

        user.DisplayName.ShouldBeNull();
        user.Groups.ShouldBe(["devs"]);
    }

    [Fact]
    public void RecordLogin_AfterProvision_CarriesProvisionedFlag()
    {
        var user = User.Provision(Name("carol"), Now);

        user.RecordLogin(null, [], null, provisioned: true, Now);

        user.DomainEvents.OfType<UserLoggedIn>().ShouldHaveSingleItem().Provisioned.ShouldBeTrue();
    }

    [Fact]
    public void RecordLogin_OnDeactivatedUser_FailsAndChangesNothing()
    {
        var user = LoggedInUser();
        user.Deactivate(OtherAdmin, 1);
        user.ClearDomainEvents();
        var lastLogin = user.LastLoginAt;

        var result = user.RecordLogin("New", ["new"], AdminConfigurationSource.UserList, provisioned: false, Now.AddHours(1));

        result.IsFailure.ShouldBeTrue();
        result.Error.Code.ShouldBe("Users.Deactivated");
        user.LastLoginAt.ShouldBe(lastLogin);
        user.AdminConfigurationSource.ShouldBeNull();
        user.Role.ShouldBe(UserRole.User);
        user.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void RecordLogin_ConfigurationSourceAppears_PromotesWithConfigurationEvent()
    {
        var user = RegularUser();

        user.RecordLogin(null, ["fleetconsole-admins"], AdminConfigurationSource.ForGroup("fleetconsole-admins"), provisioned: false, Now);

        user.Role.ShouldBe(UserRole.Admin);
        user.IsAdminByAssignment.ShouldBeFalse();
        user.AdminConfigurationSource.ShouldBe(AdminConfigurationSource.ForGroup("fleetconsole-admins"));
        user.DomainEvents.Count.ShouldBe(2);
        user.DomainEvents.First().ShouldBeOfType<UserLoggedIn>();
        user.DomainEvents.Last().ShouldBe(new UserRoleChanged(
            user.Id, "alice", UserRole.User, UserRole.Admin, RoleChangeSource.Configuration, "group fleetconsole-admins"));
    }

    [Fact]
    public void RecordLogin_ConfigurationSourceRemoved_DemotesConfigOnlyAdmin_ReportingFormerSource()
    {
        var user = ConfigAdmin(AdminConfigurationSource.ForGroup("fleetconsole-admins"));

        user.RecordLogin(null, [], null, provisioned: false, Now.AddDays(1));

        user.Role.ShouldBe(UserRole.User);
        user.AdminConfigurationSource.ShouldBeNull();
        user.DomainEvents.OfType<UserRoleChanged>().ShouldHaveSingleItem().ShouldBe(new UserRoleChanged(
            user.Id, "alice", UserRole.Admin, UserRole.User, RoleChangeSource.Configuration, "group fleetconsole-admins"));
    }

    [Fact]
    public void RecordLogin_ManualAndConfigAdmin_StaysAdminAfterConfigRemoval()
    {
        // ADR-0009: an admin who was also promoted explicitly keeps the role when leaving the configured admin group.
        var user = AdminByAssignment();
        user.RecordLogin(null, ["fleetconsole-admins"], AdminConfigurationSource.ForGroup("fleetconsole-admins"), provisioned: false, Now);
        user.ClearDomainEvents();

        user.RecordLogin(null, [], null, provisioned: false, Now.AddDays(1));

        user.Role.ShouldBe(UserRole.Admin);
        user.IsAdminByAssignment.ShouldBeTrue();
        user.AdminConfigurationSource.ShouldBeNull();
        user.DomainEvents.OfType<UserRoleChanged>().ShouldBeEmpty();
    }

    [Fact]
    public void RecordLogin_ConfigurationSourceChangesButRoleDoesNot_RaisesNoRoleEvent()
    {
        var user = ConfigAdmin(AdminConfigurationSource.ForGroup("a"));

        user.RecordLogin(null, [], AdminConfigurationSource.UserList, provisioned: false, Now.AddDays(1));

        user.AdminConfigurationSource.ShouldBe(AdminConfigurationSource.UserList);
        user.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<UserLoggedIn>();
    }

    // ---- change role (USR-3, ADM-5, USR-6) --------------------------------------------------------------------------

    [Fact]
    public void ChangeRole_Promote_SetsAssignment_AndRaisesManualEvent()
    {
        var user = RegularUser();

        user.ChangeRole(UserRole.Admin, OtherAdmin, activeWritableAdminCount: 1).IsSuccess.ShouldBeTrue();

        user.Role.ShouldBe(UserRole.Admin);
        user.IsAdminByAssignment.ShouldBeTrue();
        user.DomainEvents.ShouldBe([new UserRoleChanged(
            user.Id, "alice", UserRole.User, UserRole.Admin, RoleChangeSource.Manual, null)]);
        user.DomainEvents.OfType<UserRoleChanged>().Single().ConfigurationSource.ShouldBeNull();
    }

    [Fact]
    public void ChangeRole_Demote_ClearsAssignment_WhenAnotherAdminRemains()
    {
        var user = AdminByAssignment();

        user.ChangeRole(UserRole.User, OtherAdmin, activeWritableAdminCount: 2).IsSuccess.ShouldBeTrue();

        user.Role.ShouldBe(UserRole.User);
        user.IsAdminByAssignment.ShouldBeFalse();
        user.DomainEvents.ShouldBe([new UserRoleChanged(
            user.Id, "alice", UserRole.Admin, UserRole.User, RoleChangeSource.Manual, null)]);
    }

    [Fact]
    public void ChangeRole_DemoteLastActiveWritableAdmin_IsRefused()
    {
        var user = AdminByAssignment();

        var result = user.ChangeRole(UserRole.User, OtherAdmin, activeWritableAdminCount: 1);

        result.Error.ShouldBe(UserErrors.LastAdmin("alice"));
        user.Role.ShouldBe(UserRole.Admin);
        user.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void ChangeRole_DemoteReadOnlyAdmin_IsAllowedEvenIfCountIsOne()
    {
        // A read-only admin is not an "active writable" admin, so demoting them cannot remove the last one.
        var user = AdminByAssignment();
        user.SetReadOnly(true, activeWritableAdminCount: 2);
        user.ClearDomainEvents();

        user.ChangeRole(UserRole.User, OtherAdmin, activeWritableAdminCount: 1).IsSuccess.ShouldBeTrue();
        user.Role.ShouldBe(UserRole.User);
    }

    [Fact]
    public void ChangeRole_DemoteSelf_IsRefused()
    {
        var user = AdminByAssignment();

        var result = user.ChangeRole(UserRole.User, user.Id, activeWritableAdminCount: 5);

        result.Error.ShouldBe(UserErrors.SelfChange());
        user.Role.ShouldBe(UserRole.Admin);
        user.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void ChangeRole_DemoteConfigurationAdmin_IsRefused()
    {
        var user = ConfigAdmin(AdminConfigurationSource.ForGroup("fleetconsole-admins"));

        var result = user.ChangeRole(UserRole.User, OtherAdmin, activeWritableAdminCount: 5);

        result.Error.ShouldBe(UserErrors.AdminViaConfiguration(AdminConfigurationSource.ForGroup("fleetconsole-admins")));
        user.Role.ShouldBe(UserRole.Admin);
        user.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void ChangeRole_DemoteManualAndConfigAdmin_IsRefusedWhileConfigSourceSet()
    {
        var user = AdminByAssignment();
        user.RecordLogin(null, [], AdminConfigurationSource.UserList, provisioned: false, Now);
        user.ClearDomainEvents();

        user.ChangeRole(UserRole.User, OtherAdmin, 5).Error.ShouldBe(UserErrors.AdminViaConfiguration(AdminConfigurationSource.UserList));
        user.IsAdminByAssignment.ShouldBeTrue();
    }

    [Theory]
    [InlineData(UserRole.User)]
    [InlineData(UserRole.Admin)]
    public void ChangeRole_ToCurrentRole_SucceedsWithoutEvent(UserRole role)
    {
        var user = role == UserRole.Admin ? AdminByAssignment() : RegularUser();

        // Even "self" and a count of 1 do not matter when nothing changes.
        user.ChangeRole(role, user.Id, activeWritableAdminCount: 1).IsSuccess.ShouldBeTrue();

        user.Role.ShouldBe(role);
        user.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void ChangeRole_PromoteConfigurationOnlyAdmin_RecordsAssignment_WithSameRoleEvent()
    {
        // ADR-0017: promote records the assignment even though the effective role is already Admin.
        var user = ConfigAdmin(AdminConfigurationSource.ForGroup("fleetconsole-admins"));

        user.ChangeRole(UserRole.Admin, OtherAdmin, activeWritableAdminCount: 1).IsSuccess.ShouldBeTrue();

        user.Role.ShouldBe(UserRole.Admin);
        user.IsAdminByAssignment.ShouldBeTrue();
        user.DomainEvents.ShouldBe([new UserRoleChanged(
            user.Id, "alice", UserRole.Admin, UserRole.Admin, RoleChangeSource.Manual, "group fleetconsole-admins")]);
    }

    [Fact]
    public void ChangeRole_PromotedConfigurationAdmin_StaysAdminAfterLeavingConfigGroup()
    {
        var user = ConfigAdmin(AdminConfigurationSource.ForGroup("fleetconsole-admins"));
        user.ChangeRole(UserRole.Admin, OtherAdmin, activeWritableAdminCount: 1);
        user.ClearDomainEvents();

        user.RecordLogin(null, [], null, provisioned: false, Now.AddDays(1)).IsSuccess.ShouldBeTrue();

        user.Role.ShouldBe(UserRole.Admin);
        user.AdminConfigurationSource.ShouldBeNull();
        user.DomainEvents.OfType<UserRoleChanged>().ShouldBeEmpty();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ChangeRole_PromoteAdminByAssignmentAgain_SucceedsWithoutEvent(bool viaUserList)
    {
        // Covers a manual admin and a manual+configuration admin.
        var user = AdminByAssignment();
        user.RecordLogin(null, [], viaUserList ? AdminConfigurationSource.UserList : null, provisioned: false, Now);
        user.ClearDomainEvents();

        user.ChangeRole(UserRole.Admin, OtherAdmin, activeWritableAdminCount: 1).IsSuccess.ShouldBeTrue();

        user.IsAdminByAssignment.ShouldBeTrue();
        user.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void ChangeRole_GuardsArguments()
    {
        var user = RegularUser();

        Should.Throw<ArgumentException>(() => user.ChangeRole(UserRole.Admin, default, 1));
        Should.Throw<ArgumentOutOfRangeException>(() => user.ChangeRole(UserRole.Admin, OtherAdmin, -1));
        Should.Throw<ArgumentOutOfRangeException>(() => user.ChangeRole((UserRole)9, OtherAdmin, 1));
    }

    // ---- read-only (USR-5, ADM-5) -----------------------------------------------------------------------------------

    [Fact]
    public void SetReadOnly_TogglesFlag_AndRaisesEvent()
    {
        var user = RegularUser();

        user.SetReadOnly(true, activeWritableAdminCount: 1).IsSuccess.ShouldBeTrue();
        user.SetReadOnly(false, activeWritableAdminCount: 1).IsSuccess.ShouldBeTrue();

        user.IsReadOnly.ShouldBeFalse();
        user.DomainEvents.ShouldBe([
            new UserReadOnlyChanged(user.Id, "alice", true),
            new UserReadOnlyChanged(user.Id, "alice", false),
        ]);
    }

    [Fact]
    public void SetReadOnly_OnLastActiveWritableAdmin_IsRefused()
    {
        var user = AdminByAssignment();

        user.SetReadOnly(true, activeWritableAdminCount: 1).Error.ShouldBe(UserErrors.LastAdmin("alice"));

        user.IsReadOnly.ShouldBeFalse();
        user.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void SetReadOnly_OnAdmin_IsAllowedWhenAnotherAdminRemains()
    {
        var user = AdminByAssignment();

        user.SetReadOnly(true, activeWritableAdminCount: 2).IsSuccess.ShouldBeTrue();

        user.IsReadOnly.ShouldBeTrue();
        user.IsActiveWritableAdmin.ShouldBeFalse();
    }

    [Fact]
    public void SetReadOnly_ClearingOnLastAdmin_IsAllowed()
    {
        // Removing read-only adds a writable admin; the last-admin rule only blocks changes that remove one.
        var user = User.PreCreate(Name("alice"), UserRole.Admin, isReadOnly: true, "bob", Now);
        user.ClearDomainEvents();

        user.SetReadOnly(false, activeWritableAdminCount: 0).IsSuccess.ShouldBeTrue();
        user.IsActiveWritableAdmin.ShouldBeTrue();
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void SetReadOnly_ToCurrentValue_SucceedsWithoutEvent(bool value)
    {
        var user = User.PreCreate(Name("alice"), UserRole.Admin, isReadOnly: value, "bob", Now);
        user.ClearDomainEvents();

        user.SetReadOnly(value, activeWritableAdminCount: 1).IsSuccess.ShouldBeTrue();

        user.DomainEvents.ShouldBeEmpty();
    }

    // ---- deactivate / reactivate (USR-4, ADM-5, ADR-0009 stamp) -----------------------------------------------------

    [Fact]
    public void Deactivate_RotatesSecurityStamp_AndRaisesEvent()
    {
        var user = LoggedInUser();
        var stamp = user.SecurityStamp;

        user.Deactivate(OtherAdmin, activeWritableAdminCount: 1).IsSuccess.ShouldBeTrue();

        user.IsDeactivated.ShouldBeTrue();
        user.SecurityStamp.ShouldNotBe(stamp);
        user.SecurityStamp.ShouldNotBe(Guid.Empty);
        user.DomainEvents.ShouldBe([new UserDeactivated(user.Id, "alice")]);
    }

    [Fact]
    public void Deactivate_Self_IsRefused()
    {
        var user = AdminByAssignment();
        var stamp = user.SecurityStamp;

        user.Deactivate(user.Id, activeWritableAdminCount: 3).Error.ShouldBe(UserErrors.SelfChange());

        user.IsDeactivated.ShouldBeFalse();
        user.SecurityStamp.ShouldBe(stamp);
        user.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void Deactivate_LastActiveWritableAdmin_IsRefused()
    {
        var user = AdminByAssignment();

        user.Deactivate(OtherAdmin, activeWritableAdminCount: 1).Error.ShouldBe(UserErrors.LastAdmin("alice"));

        user.IsDeactivated.ShouldBeFalse();
        user.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void Deactivate_ConfigurationAdmin_CountsForLastAdmin()
    {
        var user = ConfigAdmin(AdminConfigurationSource.UserList);

        user.Deactivate(OtherAdmin, activeWritableAdminCount: 1).Error.ShouldBe(UserErrors.LastAdmin("alice"));
        user.Deactivate(OtherAdmin, activeWritableAdminCount: 2).IsSuccess.ShouldBeTrue();
    }

    [Fact]
    public void Deactivate_WhenAlreadyDeactivated_SucceedsWithoutEventOrNewStamp()
    {
        var user = LoggedInUser();
        user.Deactivate(OtherAdmin, 1);
        user.ClearDomainEvents();
        var stamp = user.SecurityStamp;

        user.Deactivate(user.Id, activeWritableAdminCount: 0).IsSuccess.ShouldBeTrue();

        user.SecurityStamp.ShouldBe(stamp);
        user.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void Reactivate_KeepsRotatedStamp_AndRaisesEvent()
    {
        var user = LoggedInUser();
        var original = user.SecurityStamp;
        user.Deactivate(OtherAdmin, 1);
        var rotated = user.SecurityStamp;
        user.ClearDomainEvents();

        user.Reactivate().IsSuccess.ShouldBeTrue();

        user.IsDeactivated.ShouldBeFalse();
        user.SecurityStamp.ShouldBe(rotated);
        user.SecurityStamp.ShouldNotBe(original);
        user.DomainEvents.ShouldBe([new UserReactivated(user.Id, "alice")]);
    }

    [Fact]
    public void Reactivate_WhenActive_SucceedsWithoutEvent()
    {
        var user = LoggedInUser();

        user.Reactivate().IsSuccess.ShouldBeTrue();

        user.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void Reactivate_AllowsLoginAgain()
    {
        var user = LoggedInUser();
        user.Deactivate(OtherAdmin, 1);
        user.Reactivate();

        user.RecordLogin(null, [], null, provisioned: false, Now.AddDays(1)).IsSuccess.ShouldBeTrue();
    }

    // ---- IsActiveWritableAdmin --------------------------------------------------------------------------------------

    [Fact]
    public void IsActiveWritableAdmin_RequiresAdminNotDeactivatedNotReadOnly()
    {
        RegularUser().IsActiveWritableAdmin.ShouldBeFalse();
        AdminByAssignment().IsActiveWritableAdmin.ShouldBeTrue();
        ConfigAdmin(AdminConfigurationSource.UserList).IsActiveWritableAdmin.ShouldBeTrue();
        User.PreCreate(Name("x"), UserRole.Admin, isReadOnly: true, "bob", Now).IsActiveWritableAdmin.ShouldBeFalse();

        var deactivated = AdminByAssignment();
        deactivated.Deactivate(OtherAdmin, 2);
        deactivated.IsActiveWritableAdmin.ShouldBeFalse();
    }

    // ---- helpers ----------------------------------------------------------------------------------------------------

    private static Username Name(string value) => Username.Create(value).Value;

    private static User RegularUser()
    {
        var user = User.PreCreate(Name("alice"), UserRole.User, isReadOnly: false, "bob", Now);
        user.ClearDomainEvents();
        return user;
    }

    private static User AdminByAssignment()
    {
        var user = User.PreCreate(Name("alice"), UserRole.Admin, isReadOnly: false, "bob", Now);
        user.ClearDomainEvents();
        return user;
    }

    private static User LoggedInUser()
    {
        var user = RegularUser();
        user.RecordLogin("Alice", ["devs"], null, provisioned: false, Now);
        user.ClearDomainEvents();
        return user;
    }

    private static User ConfigAdmin(AdminConfigurationSource source)
    {
        var user = RegularUser();
        user.RecordLogin(null, [], source, provisioned: false, Now);
        user.ClearDomainEvents();
        return user;
    }
}
