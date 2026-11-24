using FleetConsole.Domain.Access;

namespace FleetConsole.Domain.Tests.Access;

public sealed class GroupNameTests
{
    [Theory]
    [InlineData("sre-emea", "sre-emea")]
    [InlineData("  sre-emea  ", "sre-emea")]
    [InlineData("Platform Team", "Platform Team")]
    [InlineData("team.ops_1", "team.ops_1")]
    public void Create_AcceptsAndTrims(string input, string expected) =>
        GroupName.Create(input).Value.Value.ShouldBe(expected);

    [Fact]
    public void Create_AcceptsMaxLength() =>
        GroupName.Create(new string('a', GroupName.MaxLength)).IsSuccess.ShouldBeTrue();

    [Theory]
    [InlineData("system:authenticated")]
    [InlineData("SYSTEM:masters")]
    [InlineData("System:")]
    [InlineData("  system:cluster-admins")]
    [InlineData("system:bad/name")]   // the system check comes first, even when the name is invalid anyway
    public void Create_RefusesSystemGroupsFirst_AnyCase(string input) =>
        GroupName.Create(input).Error!.Code.ShouldBe("Grants.SystemGroup");

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(".")]
    [InlineData("..")]
    [InlineData("a/b")]
    [InlineData("a%b")]
    [InlineData("team:ops")]
    [InlineData("tab\there")]
    [InlineData("nul\0")]
    public void Create_RefusesInvalidNames(string? input) =>
        GroupName.Create(input).Error!.Code.ShouldBe("Grants.InvalidGroupName");

    [Fact]
    public void Create_RefusesOverMaxLength() =>
        GroupName.Create(new string('a', GroupName.MaxLength + 1)).Error!.Code.ShouldBe("Grants.InvalidGroupName");

    [Fact]
    public void Equality_IsOrdinal()
    {
        GroupName.Create("sre").Value.ShouldBe(GroupName.Create(" sre ").Value);
        GroupName.Create("sre").Value.ShouldNotBe(GroupName.Create("SRE").Value);
    }

    [Fact]
    public void Errors_HaveContractMessages()
    {
        GrantErrors.SystemGroup().Message.ShouldBe("System groups can't be granted access.");
        GrantErrors.InvalidGroupName().Message.ShouldBe("Enter a valid group name.");
        GrantErrors.PriorityOutOfRange().Message.ShouldBe("Priority must be between 1 and 1000.");
        GrantErrors.GroupAlreadyExists("sre", "prod").Message.ShouldBe("Group \"sre\" already has access to \"prod\".");
        GrantErrors.PriorityTaken(50, "ops").Message.ShouldBe("Priority 50 is already used by group `ops` on this cluster.");
    }
}
