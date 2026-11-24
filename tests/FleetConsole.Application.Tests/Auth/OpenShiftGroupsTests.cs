using FleetConsole.Application.Auth;

namespace FleetConsole.Application.Tests.Auth;

/// <summary>
/// <see cref="OpenShiftGroups"/>: the virtual <c>system:*</c> filter applied before groups are stored, which must ignore
/// case so it matches <c>GroupName</c> and the access resolver (GRP-3, T-0272).
/// </summary>
public sealed class OpenShiftGroupsTests
{
    [Theory]
    [InlineData("system:authenticated", true)]
    [InlineData("System:Ops", true)]
    [InlineData("SYSTEM:authenticated", true)]
    [InlineData("sre", false)]
    [InlineData("systems-team", false)]
    public void IsVirtual_MatchesTheSystemPrefixInAnyCase(string group, bool expected) =>
        OpenShiftGroups.IsVirtual(group).ShouldBe(expected);

    [Fact]
    public void WithoutVirtualGroups_DropsMixedCaseSystemGroups() =>
        OpenShiftGroups.WithoutVirtualGroups(["System:Ops", "SYSTEM:authenticated", "sre"]).ShouldBe(["sre"]);
}
