using FleetConsole.Domain.Users;
using FleetConsole.Domain.Users.Events;
using static FleetConsole.Domain.Tests.DomainTestData;

namespace FleetConsole.Domain.Tests.Users;

public sealed class UserGroupsTests
{
    [Fact]
    public void ReplaceGroups_SameSetInAnotherOrder_ReturnsFalseAndRaisesNothing()
    {
        var user = UserWithGroups("sre", "ops");

        user.ReplaceGroups(["ops", "sre", "ops"]).ShouldBeFalse();

        user.Groups.ShouldBe(["sre", "ops"]);
        user.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void ReplaceGroups_Changed_StoresGroupsAndReportsAddedAndRemoved()
    {
        var user = UserWithGroups("sre", "ops");

        user.ReplaceGroups(["ops", "dba", "web"]).ShouldBeTrue();

        user.Groups.ShouldBe(["ops", "dba", "web"]);
        var changed = user.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<UserGroupsChanged>();
        changed.UserId.ShouldBe(user.Id);
        changed.Username.ShouldBe("alice");
        changed.Added.ShouldBe(["dba", "web"]);
        changed.Removed.ShouldBe(["sre"]);
    }

    [Fact]
    public void ReplaceGroups_WithDuplicates_StoresAndReportsEachGroupOnce()
    {
        var user = UserWithGroups("sre");

        user.ReplaceGroups(["dba", "sre", "dba", "web", "web"]).ShouldBeTrue();

        user.Groups.ShouldBe(["dba", "sre", "web"]);
        user.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<UserGroupsChanged>().Added.ShouldBe(["dba", "web"]);
    }

    [Fact]
    public void ReplaceGroups_ComparesOrdinally()
    {
        var user = UserWithGroups("sre");

        user.ReplaceGroups(["SRE"]).ShouldBeTrue();

        var changed = user.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<UserGroupsChanged>();
        changed.Added.ShouldBe(["SRE"]);
        changed.Removed.ShouldBe(["sre"]);
    }

    [Fact]
    public void ReplaceGroups_ToEmpty_ReportsAllRemoved()
    {
        var user = UserWithGroups("sre");

        user.ReplaceGroups([]).ShouldBeTrue();

        user.Groups.ShouldBeEmpty();
        user.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<UserGroupsChanged>().Removed.ShouldBe(["sre"]);
    }

    [Fact]
    public void ReplaceGroups_SystemGroup_Throws()
    {
        var user = UserWithGroups("sre");

        Should.Throw<ArgumentException>(() => user.ReplaceGroups(["sre", "system:authenticated"]));
        user.Groups.ShouldBe(["sre"]);
    }

    private static User UserWithGroups(params string[] groups)
    {
        var user = NewUser();
        user.RecordLogin(null, groups, null, provisioned: false, Now).IsSuccess.ShouldBeTrue();
        user.ClearDomainEvents();
        return user;
    }
}
