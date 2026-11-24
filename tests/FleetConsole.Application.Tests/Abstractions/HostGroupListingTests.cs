using FleetConsole.Application.Abstractions.Kubernetes;

namespace FleetConsole.Application.Tests.Abstractions;

/// <summary><see cref="HostGroupListing"/>: membership lookup and the shape of failed listings (ADR-0039).</summary>
public sealed class HostGroupListingTests
{
    [Fact]
    public void GroupsOf_MatchesOrdinal_AndSorts()
    {
        var listing = new HostGroupListing(HostGroupsStatus.Ok, DateTimeOffset.UnixEpoch,
        [
            new HostGroup("sre", ["alice", "bob"]),
            new HostGroup("auditors", ["alice"]),
            new HostGroup("Admins", ["Alice"]),
            new HostGroup("empty", []),
        ]);

        listing.GroupsOf("alice").ShouldBe(["auditors", "sre"]);
        listing.GroupsOf("Alice").ShouldBe(["Admins"]);
        listing.GroupsOf("carol").ShouldBeEmpty();
    }

    [Theory]
    [InlineData(HostGroupsStatus.Forbidden)]
    [InlineData(HostGroupsStatus.Unavailable)]
    public void Failed_HasNoTimeAndNoGroups(HostGroupsStatus status)
    {
        var listing = HostGroupListing.Failed(status);

        listing.Status.ShouldBe(status);
        listing.ReadAt.ShouldBeNull();
        listing.Groups.ShouldBeEmpty();
        listing.GroupsOf("alice").ShouldBeEmpty();
    }

    [Fact]
    public void Failed_RefusesOk() =>
        Should.Throw<ArgumentOutOfRangeException>(() => HostGroupListing.Failed(HostGroupsStatus.Ok));
}
