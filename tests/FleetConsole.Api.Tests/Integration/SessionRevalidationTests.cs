using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Api.Tests.Identity;
using FleetConsole.Api.Tests.Persistence;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.DependencyInjection;
using static FleetConsole.Api.Tests.Integration.AuthEndpointsTests;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// AUTH-11 / ADR-0009 through HTTP: with <c>Auth:RevalidationInterval=00:00:00</c> every request re-reads the user, so
/// changes made below HTTP (<see cref="TestData"/>) are visible on the next call. One variant host for the class.
/// Host groups (PREC-1, ADR-0039): the variant runs on a <see cref="ManualClock"/>; <see cref="Refresh"/> moves it past
/// <c>Auth:HostGroups:MaxSnapshotAge</c>, so the next revalidation reads the emulator's current <c>groups</c> list.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class SessionRevalidationTests(ApiFactory factory) : IAsyncLifetime
{
    private ApiFactory _host = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Dictionary<string, string?> EveryRequestReadsGroups => new()
    {
        ["Auth:RevalidationInterval"] = "00:00:00",
        ["Auth:HostGroups:MaxSnapshotAge"] = "00:00:10",
    };

    public async ValueTask InitializeAsync() => _host = await factory.CreateVariantAsync(EveryRequestReadsGroups, clock: new ManualClock());

    /// <summary>Ages <paramref name="host"/>'s group snapshot out, so the next revalidation re-reads the host groups.</summary>
    private static void Refresh(ApiFactory host) => host.Clock.ShouldNotBeNull().Advance(TimeSpan.FromSeconds(11));

    public async ValueTask DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public async Task DeactivatedUser_NextCallIs401_AndTheCookieIsCleared()
    {
        var user = await _host.Data.UserAsync();
        using var client = await _host.LoginAsAsync(user.Username);
        (await client.MeStatusAsync()).ShouldBe(HttpStatusCode.OK);

        await _host.Data.DeactivateAsync(user.Username);

        using var response = await client.GetAsync(new Uri("/api/auth/me", UriKind.Relative), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("code").GetString().ShouldBe("Auth.Unauthenticated");
        var cleared = SessionCookieHeader(response).ShouldNotBeNull();
        DateTimeOffset.Parse(Attributes(cleared)["expires"], System.Globalization.CultureInfo.InvariantCulture)
            .ShouldBeLessThan(DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task RoleAndReadOnlyChanges_AreReflectedWithoutReLogin()
    {
        var user = await _host.Data.UserAsync();
        using var client = await _host.LoginAsAsync(user.Username);
        var before = await GetMeAsync(client);
        before.GetProperty("role").GetString().ShouldBe("user");
        before.GetProperty("isReadOnly").GetBoolean().ShouldBeFalse();

        // Read-only first: a writable admin would be the variant's only one and couldn't be made read-only (ADM-5).
        await _host.Data.SetReadOnlyAsync(user.Username, isReadOnly: true);
        await _host.Data.SetRoleAsync(user.Username, UserRole.Admin);

        var after = await GetMeAsync(client);
        after.GetProperty("role").GetString().ShouldBe("admin");
        after.GetProperty("isReadOnly").GetBoolean().ShouldBeTrue();
    }

    [Fact]
    public async Task DeactivateThenReactivate_DoesNotReviveTheOldSession()
    {
        // The stamp rotated by Deactivate is not restored by Reactivate (ADR-0009); no request in between.
        var user = await _host.Data.UserAsync();
        using var client = await _host.LoginAsAsync(user.Username);

        await _host.Data.DeactivateAsync(user.Username);
        await _host.Data.ReactivateAsync(user.Username);

        (await client.MeStatusAsync()).ShouldBe(HttpStatusCode.Unauthorized);
        using var again = await _host.LoginAsAsync(user.Username); // a fresh login works
        (await again.MeStatusAsync()).ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task EachRevalidation_RenewsTheCookie()
    {
        // Sliding expiration (AUTH-4): a refreshed session is re-issued with a new expiry.
        using var client = await _host.LoginAsAsync(_host.NewUsername());

        using var response = await client.GetAsync(new Uri("/api/auth/me", UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var renewed = SessionCookieHeader(response).ShouldNotBeNull();
        DateTimeOffset.Parse(Attributes(renewed)["expires"], System.Globalization.CultureInfo.InvariantCulture)
            .ShouldBeGreaterThan(DateTimeOffset.UtcNow.AddHours(7));
    }

    [Fact]
    public async Task WithTheDefaultInterval_ChangesWaitForTheNextCheck()
    {
        // Counterpart on the default host (60 s): the session keeps its claims until revalidation is due.
        var user = await factory.Data.UserAsync();
        using var client = await factory.LoginAsAsync(user.Username);

        await factory.Data.SetRoleAsync(user.Username, UserRole.Admin);

        (await GetMeAsync(client)).GetProperty("role").GetString().ShouldBe("user");
    }

    // ---- Host group sync (T-0255, PREC-1, ADR-0039) ----------------------------------------------------------------

    [Fact]
    public async Task RemovedFromHostGroup_NextRevalidationDropsTheGroup_WithOneAuditEntryPerChange()
    {
        // The proxy/cluster-list half of PREC-1 (403 / not listed) needs group grants in authorization (T-0253).
        var group = "sre-emea-" + TestData.Unique();
        var user = await _host.Data.UserAsync();
        await GroupGrantAsync(_host, group);
        _host.OAuthServer.GroupMembership.SetGroups(user.Username, [group]);
        Refresh(_host);
        using var client = await _host.LoginAsAsync(user.Username);

        (await client.MeStatusAsync()).ShouldBe(HttpStatusCode.OK);
        (await _host.Data.FindUserAsync(user.Username)).ShouldNotBeNull().Groups.ShouldBe([group]);

        _host.OAuthServer.GroupMembership.SetGroups(user.Username, []);
        Refresh(_host);
        (await client.MeStatusAsync()).ShouldBe(HttpStatusCode.OK, "a successful read with fewer groups keeps the session");
        (await _host.Data.FindUserAsync(user.Username)).ShouldNotBeNull().Groups.ShouldBeEmpty();

        var changes = (await _host.Data.AuditEntriesAsync(user.Username)).Where(e => e.Action == "user.groups_changed").ToList();
        changes.Count.ShouldBe(2, "joined (first sync after login), then removed");
        changes.ShouldAllBe(e => e.Actor.Name == Domain.Audit.AuditActor.RevalidationName);
    }

    [Fact]
    public async Task UnchangedMembership_DoesNotWriteTheUserRow_ButUpdatesTheCheckTime()
    {
        var user = await _host.Data.UserAsync();
        _host.OAuthServer.GroupMembership.SetGroups(user.Username, ["steady-" + TestData.Unique()]);
        Refresh(_host);
        using var client = await _host.LoginAsAsync(user.Username);
        (await client.MeStatusAsync()).ShouldBe(HttpStatusCode.OK); // first sync records the group
        var version = (await _host.Data.FindUserAsync(user.Username)).ShouldNotBeNull().Version;
        var checkedBefore = await CheckedAtAsync(_host, user.Id);
        Refresh(_host);

        (await client.MeStatusAsync()).ShouldBe(HttpStatusCode.OK);

        (await _host.Data.FindUserAsync(user.Username)).ShouldNotBeNull().Version.ShouldBe(version, "users.xmin untouched");
        (await CheckedAtAsync(_host, user.Id)).ShouldNotBeNull().ShouldBeGreaterThan(checkedBefore.ShouldNotBeNull());
    }

    [Fact]
    public async Task ReadOnlyUser_IsSynced()
    {
        var group = "ro-" + TestData.Unique();
        var user = await _host.Data.UserAsync(isReadOnly: true);
        _host.OAuthServer.GroupMembership.SetGroups(user.Username, [group]);
        Refresh(_host);
        using var client = await _host.LoginAsAsync(user.Username);

        (await client.MeStatusAsync()).ShouldBe(HttpStatusCode.OK);

        (await _host.Data.FindUserAsync(user.Username)).ShouldNotBeNull().Groups.ShouldBe([group]);
    }

    [Fact]
    public async Task Login_RecordsTheCheckTime_ForExistingAndProvisionedUsers()
    {
        var existing = await _host.Data.UserAsync();
        using var first = await _host.LoginAsAsync(existing.Username);
        (await CheckedAtAsync(_host, existing.Id)).ShouldNotBeNull();

        var provisioned = _host.NewUsername();
        using var second = await _host.LoginAsAsync(provisioned);
        var user = (await _host.Data.FindUserAsync(provisioned)).ShouldNotBeNull();
        (await CheckedAtAsync(_host, user.Id)).ShouldNotBeNull("staged with the new user, committed after its row");
    }

    [Fact]
    public async Task HostUnreachable_EndsSessionsWhoseGroupsCarryGrants_KeepsDirectOnlySessions()
    {
        await using var host = await factory.CreateVariantAsync(EveryRequestReadsGroups, clock: new ManualClock());
        var group = "sre-emea-" + TestData.Unique();
        await GroupGrantAsync(host, group);

        var member = await host.Data.UserAsync();
        host.OAuthServer.GroupMembership.SetGroups(member.Username, [group]);
        Refresh(host);
        using var memberClient = await host.LoginAsAsync(member.Username);
        (await memberClient.MeStatusAsync()).ShouldBe(HttpStatusCode.OK); // records the group

        var direct = await host.Data.UserAsync();
        var cluster = await host.Data.ClusterAsync();
        var credential = await host.Data.CredentialAsync(cluster.Name);
        await host.Data.GrantAsync(direct.Username, cluster.Name, credential.Id);
        using var directClient = await host.LoginAsAsync(direct.Username);

        host.HostStub.Down = true;
        Refresh(host);

        (await memberClient.MeStatusAsync()).ShouldBe(HttpStatusCode.Unauthorized, "stale groups could keep removed access");
        (await directClient.MeStatusAsync()).ShouldBe(HttpStatusCode.OK, "no recorded group carries a grant");
        host.Logs.AllText.ShouldNotContain(group, Case.Sensitive, "group names are never logged");
    }

    /// <summary>Seeds a group grant for <paramref name="group"/> on a fresh cluster of <paramref name="host"/>.</summary>
    private static async Task GroupGrantAsync(ApiFactory host, string group)
    {
        var cluster = await host.Data.ClusterAsync();
        var seeded = await host.Data.CredentialAsync(cluster.Name);
        await using var scope = host.Services.CreateSignedInScope(TestData.Actor);
        var services = scope.ServiceProvider;
        var registered = await services.GetRequiredService<IClusterRepository>().GetByNameAsync(ClusterName.Create(cluster.Name).Value, Ct);
        var credential = await services.GetRequiredService<FleetConsole.Application.Abstractions.Persistence.ICredentialRepository>()
            .GetByIdAsync(seeded.Id, Ct);
        var grant = Grant.CreateForGroup(
            GroupName.Create(group).Value, registered.ShouldNotBeNull(), credential.ShouldNotBeNull(), AccessMode.ReadOnly,
            priority: 10, [], TestData.Actor, DateTimeOffset.UtcNow);
        services.GetRequiredService<IGrantRepository>().Add(grant.Value);
        await services.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
    }

    private static async Task<DateTimeOffset?> CheckedAtAsync(ApiFactory host, UserId userId)
    {
        await using var scope = host.Services.CreateAsyncScope();
        var readModel = scope.ServiceProvider.GetRequiredService<IReadModel>();
        var row = await readModel.FirstOrDefaultAsync(readModel.UserGroupChecks.Where(c => c.UserId == userId), Ct);
        return row?.CheckedAt;
    }
}
