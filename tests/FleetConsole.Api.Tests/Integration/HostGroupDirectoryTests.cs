using System.Globalization;
using System.Net;
using FleetConsole.Api.Tests.Identity;
using FleetConsole.Application.Abstractions.Kubernetes;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// The Api's <see cref="IHostGroupDirectory"/> against the in-process DevOAuth emulator's <c>groups</c> list, through the
/// production registration and the test host's reader-token pair (T-0254): members, paging, <c>system:*</c> filtering,
/// 403 → Forbidden, unreachable → Unavailable. Each test uses its own variant, because it changes the emulator's
/// membership or the host switches.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class HostGroupDirectoryTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Ok_ListsEmulatorGroupsWithMembers_AcrossPages_WithoutVirtualGroups()
    {
        await using var host = await factory.CreateVariantAsync(new Dictionary<string, string?>());
        var membership = host.OAuthServer.GroupMembership;
        var member = host.NewUsername();
        membership.SetGroups(member, ["platform-team", "system:cluster-admins"]);

        // More groups than one page (limit=500) holds.
        var bulkOwner = host.NewUsername();
        membership.SetGroups(bulkOwner, Enumerable.Range(0, 520).Select(i => "bulk-" + i.ToString("000", CultureInfo.InvariantCulture)));

        var listing = await host.Services.GetRequiredService<IHostGroupDirectory>().GetAsync(Ct);

        listing.Status.ShouldBe(HostGroupsStatus.Ok);
        host.HostStub.GroupsRequests.ShouldBe(2, "520+ groups are two pages of 500");
        listing.Groups.Count(g => g.Name.StartsWith("bulk-", StringComparison.Ordinal)).ShouldBe(520);
        listing.Groups.ShouldNotContain(g => g.Name.StartsWith("system:", StringComparison.Ordinal));
        listing.Groups.Single(g => g.Name == "platform-team").Users.ShouldBe([member]);
        listing.GroupsOf(member).ShouldBe(["platform-team"]);
        listing.GroupsOf("alice").ShouldBe(["sre"], "the shipped emulator users are listed too");
        listing.Groups.Single(g => g.Name == TestOAuthServer.AdminGroup).Users.Count.ShouldBeGreaterThan(1);
    }

    [Fact]
    public async Task HostAnswers403_ThenGoesDown_StatusFollows_AndNoStaleDataIsServed()
    {
        var clock = new ManualClock();
        await using var host = await factory.CreateVariantAsync(new Dictionary<string, string?>(), clock: clock);
        var directory = host.Services.GetRequiredService<IHostGroupDirectory>();
        (await directory.GetAsync(Ct)).Status.ShouldBe(HostGroupsStatus.Ok);

        host.HostStub.GroupsEndpointStatus = HttpStatusCode.Forbidden;
        clock.Advance(TimeSpan.FromSeconds(15));
        var forbidden = await directory.GetAsync(Ct);
        forbidden.Status.ShouldBe(HostGroupsStatus.Forbidden);
        forbidden.Groups.ShouldBeEmpty();

        host.HostStub.GroupsEndpointStatus = null;
        host.HostStub.Down = true;
        var unavailable = await directory.GetAsync(Ct);
        unavailable.Status.ShouldBe(HostGroupsStatus.Unavailable);
        unavailable.Groups.ShouldBeEmpty();

        TokenLeakScanner.AssertAbsent(TestHostConfiguration.GroupsReaderToken, host.Logs.AllText);
    }

    [Fact]
    public async Task WrongReaderToken_IsForbidden()
    {
        await using var host = await factory.CreateVariantAsync(new Dictionary<string, string?>
        {
            ["Auth:HostGroups:Token"] = "fake-wrong-groups-token-0001",
        });

        (await host.Services.GetRequiredService<IHostGroupDirectory>().GetAsync(Ct)).Status.ShouldBe(HostGroupsStatus.Forbidden);
    }
}
