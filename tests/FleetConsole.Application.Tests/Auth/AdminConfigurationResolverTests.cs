using FleetConsole.Application.Auth;

namespace FleetConsole.Application.Tests.Auth;

/// <summary>Table test of <see cref="AdminConfigurationResolver"/> (ADR-0009) and the virtual-group rule.</summary>
public sealed class AdminConfigurationResolverTests
{
    public static TheoryData<string, string[], string[], string[], string?> Cases => new()
    {
        // username, user's groups, bootstrap users, admin groups, expected source
        { "alice", [], [], [], null },
        { "alice", ["sre"], ["alice"], [], "user list" },
        { "alice", ["admins"], ["alice"], ["admins"], "user list" },
        { "alice", ["admins"], [], ["admins"], "group admins" },
        { "alice", ["b", "a"], [], ["a", "b"], "group a" },
        { "alice", ["sre"], ["Alice"], ["SRE"], null },
        { "alice", ["sre"], ["bob"], ["admins"], null },
        { "alice", ["system:authenticated"], [], ["system:authenticated"], null },
        { "alice", ["system:authenticated", "ops"], [], ["system:authenticated", "ops"], "group ops" },
    };

    [Theory]
    [MemberData(nameof(Cases))]
    public void Resolve_ReturnsTheExpectedSource(string username, string[] groups, string[] bootstrap, string[] adminGroups, string? expected)
    {
        var options = new AuthOptions();
        foreach (var user in bootstrap)
        {
            options.BootstrapAdminUsers.Add(user);
        }

        foreach (var group in adminGroups)
        {
            options.AdminGroups.Add(group);
        }

        AdminConfigurationResolver.Resolve(username, groups, options).ShouldBe(expected);
    }

    [Fact]
    public void WithoutVirtualGroups_DropsSystemBlankAndDuplicateGroups_KeepingOrder()
    {
        OpenShiftGroups.WithoutVirtualGroups(["sre", "system:authenticated", "", "ops", "sre", "system:authenticated:oauth", "System:x"])
            .ShouldBe(["sre", "ops", "System:x"]);
    }
}
