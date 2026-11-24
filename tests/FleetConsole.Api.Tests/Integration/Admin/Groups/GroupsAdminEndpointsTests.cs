using System.Net;
using System.Text.Json;
using FleetConsole.Api.Tests.Identity;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using static FleetConsole.Api.Tests.Integration.Admin.Grants.GrantsApi;

namespace FleetConsole.Api.Tests.Integration.Admin.Groups;

/// <summary>
/// <c>GET /api/admin/groups</c> and <c>GET /api/admin/groups/{groupName}</c> through HTTP against the DevOAuth emulator's
/// groups (contract CP4.5a §4, GPG-1/2/4, UIG-2). The host-listing tests use their own variant: they set the emulator's
/// membership before the variant's first (snapshotted) read, or switch the host stub to 403 / down.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class GroupsAdminEndpointsTests(ApiFactory factory)
{
    private const string GroupsPath = "/api/admin/groups";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task HostOk_ListsHostAndGrantOnlyGroups_DetailMarksRegisteredMembers_And404s()
    {
        await using var host = await factory.CreateVariantAsync(new Dictionary<string, string?>());
        var (team, grantOnly) = ($"team-{TestData.Unique()}", $"gone-{TestData.Unique()}");
        var (registered, unregistered) = (host.NewUsername(), host.NewUsername());
        host.OAuthServer.GroupMembership.SetGroups(registered, [team, "system:cluster-readers"]);
        host.OAuthServer.GroupMembership.SetGroups(unregistered, [team]);
        await host.Data.UserAsync(registered);
        using var admin = await host.AdminClientAsync();
        await GrantGroupAsync(host, admin, grantOnly);

        var list = await GetJsonAsync(admin, GroupsPath);

        list.GetProperty("hostStatus").GetString().ShouldBe("ok");
        list.GetProperty("hostReadAt").ValueKind.ShouldBe(JsonValueKind.String);
        var items = list.GetProperty("items").EnumerateArray().ToList();
        var names = items.Select(i => i.GetProperty("name").GetString()!).ToList();
        names.ShouldBe(names.Order(StringComparer.Ordinal).ToList(), "sorted by name (ordinal)");
        names.ShouldNotContain(n => n.StartsWith("system:", StringComparison.Ordinal));
        var teamRow = items.Single(i => i.GetProperty("name").GetString() == team);
        teamRow.GetProperty("foundOnHost").GetBoolean().ShouldBeTrue();
        teamRow.GetProperty("memberCount").GetInt32().ShouldBe(2);
        teamRow.GetProperty("clusterCount").GetInt32().ShouldBe(0);
        var grantOnlyRow = items.Single(i => i.GetProperty("name").GetString() == grantOnly);
        grantOnlyRow.GetProperty("foundOnHost").GetBoolean().ShouldBeFalse();
        grantOnlyRow.GetProperty("memberCount").ValueKind.ShouldBe(JsonValueKind.Null);
        grantOnlyRow.GetProperty("clusterCount").GetInt32().ShouldBe(1);

        var detail = await GetJsonAsync(admin, $"{GroupsPath}/{team}");
        detail.GetProperty("foundOnHost").GetBoolean().ShouldBeTrue();
        var members = detail.GetProperty("members").EnumerateArray().ToList();
        members.Select(m => m.GetProperty("username").GetString()).ShouldBe([registered, unregistered]);
        members[0].GetProperty("isRegistered").GetBoolean().ShouldBeTrue();
        members[0].GetProperty("status").GetString().ShouldBe("pending");
        members[1].GetProperty("isRegistered").GetBoolean().ShouldBeFalse();
        members[1].GetProperty("status").ValueKind.ShouldBe(JsonValueKind.Null);

        var grantOnlyDetail = await GetJsonAsync(admin, $"{GroupsPath}/{grantOnly}");
        grantOnlyDetail.GetProperty("foundOnHost").GetBoolean().ShouldBeFalse();
        grantOnlyDetail.GetProperty("members").ValueKind.ShouldBe(JsonValueKind.Null);
        grantOnlyDetail.GetProperty("clusterCount").GetInt32().ShouldBe(1);

        foreach (var missing in new[] { $"nowhere-{TestData.Unique()}", "50%25-team", "system:authenticated" })
        {
            using var response = await admin.GetAsync(new Uri($"{GroupsPath}/{missing}", UriKind.Relative), Ct);
            (await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "Groups.NotFound"))
                .GetProperty("detail").GetString().ShouldBe("Group was not found.");
        }
    }

    [Fact]
    public async Task HostForbiddenThenDown_Is200_WithUnknownHostFacts_AndGrantOnlyGroups()
    {
        var clock = new ManualClock();
        await using var host = await factory.CreateVariantAsync(new Dictionary<string, string?>(), clock: clock);
        var grantOnly = $"gone-{TestData.Unique()}";
        using var admin = await host.AdminClientAsync();
        await GrantGroupAsync(host, admin, grantOnly);

        host.HostStub.GroupsEndpointStatus = HttpStatusCode.Forbidden;
        clock.Advance(TimeSpan.FromSeconds(15)); // past MaxSnapshotAge: the next read goes to the host
        await AssertHostUnknownAsync(admin, "forbidden", grantOnly);

        host.HostStub.GroupsEndpointStatus = null;
        host.HostStub.Down = true;
        await AssertHostUnknownAsync(admin, "unavailable", grantOnly);
    }

    [Fact]
    public async Task NonAdmin_Is403()
    {
        using var client = await factory.LoginAsAsync(factory.NewUsername());

        foreach (var path in new[] { GroupsPath, $"{GroupsPath}/sre" })
        {
            using var response = await client.GetAsync(new Uri(path, UriKind.Relative), Ct);
            await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "Auth.Forbidden");
        }
    }

    /// <summary>Asserts the list and details answer 200 with <paramref name="status"/> and null host facts (GPG-4, Q7).</summary>
    private static async Task AssertHostUnknownAsync(HttpClient admin, string status, string grantOnly)
    {
        var list = await GetJsonAsync(admin, GroupsPath);
        list.GetProperty("hostStatus").GetString().ShouldBe(status);
        list.GetProperty("hostReadAt").ValueKind.ShouldBe(JsonValueKind.Null);
        var row = list.GetProperty("items").EnumerateArray().Single(i => i.GetProperty("name").GetString() == grantOnly);
        row.GetProperty("foundOnHost").ValueKind.ShouldBe(JsonValueKind.Null);
        row.GetProperty("memberCount").ValueKind.ShouldBe(JsonValueKind.Null);
        row.GetProperty("clusterCount").GetInt32().ShouldBe(1);

        // Without a readable listing nothing proves a grant-less group missing: still 200, not 404.
        var unknown = await GetJsonAsync(admin, $"{GroupsPath}/nowhere-{TestData.Unique()}");
        unknown.GetProperty("hostStatus").GetString().ShouldBe(status);
        unknown.GetProperty("foundOnHost").ValueKind.ShouldBe(JsonValueKind.Null);
        unknown.GetProperty("members").ValueKind.ShouldBe(JsonValueKind.Null);
        unknown.GetProperty("clusterCount").GetInt32().ShouldBe(0);
    }

    private static async Task<JsonElement> GetJsonAsync(HttpClient client, string path)
    {
        using var response = await client.GetAsync(new Uri(path, UriKind.Relative), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return await response.JsonAsync();
    }

    /// <summary>Grants <paramref name="group"/> access to a fresh cluster of <paramref name="host"/> through the API.</summary>
    private static async Task GrantGroupAsync(ApiFactory host, HttpClient admin, string group)
    {
        var cluster = await host.Data.ClusterAsync();
        var credential = await host.Data.CredentialAsync(cluster.Name);
        using var response = await CreateGroupAsync(admin, group, cluster.Name, credential.Id.Value, 10);
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
    }
}
