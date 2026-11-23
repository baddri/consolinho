using FleetConsole.Domain.Users;

namespace FleetConsole.Domain.Tests.Users;

/// <summary><see cref="AdminConfigurationSource"/> (POL-4): factories, guard, value equality and the stable text form.</summary>
public sealed class AdminConfigurationSourceTests
{
    [Fact]
    public void UserList_HasNoGroup_AndTheUserListText()
    {
        AdminConfigurationSource.UserList.Kind.ShouldBe(AdminConfigurationSourceKind.UserList);
        AdminConfigurationSource.UserList.Group.ShouldBeNull();
        AdminConfigurationSource.UserList.ToString().ShouldBe("user list");
    }

    [Fact]
    public void ForGroup_KeepsTheGroupExactly_AndTheGroupText()
    {
        var source = AdminConfigurationSource.ForGroup("Fleet Admins");

        source.Kind.ShouldBe(AdminConfigurationSourceKind.Group);
        source.Group.ShouldBe("Fleet Admins");
        source.ToString().ShouldBe("group Fleet Admins");
    }

    [Fact]
    public void Equality_IsByValue()
    {
        AdminConfigurationSource.ForGroup("a").ShouldBe(AdminConfigurationSource.ForGroup("a"));
        AdminConfigurationSource.ForGroup("a").ShouldNotBe(AdminConfigurationSource.ForGroup("A"));
        AdminConfigurationSource.ForGroup("user list").ShouldNotBe(AdminConfigurationSource.UserList);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    public void ForGroup_RejectsBlankGroup(string? group)
    {
        Should.Throw<ArgumentException>(() => AdminConfigurationSource.ForGroup(group!));
    }
}
