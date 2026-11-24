using System.Net;
using System.Text.Json;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using FleetConsole.Domain.Credentials;
using static FleetConsole.Api.Tests.Integration.Admin.Grants.GrantsApi;

namespace FleetConsole.Api.Tests.Integration.Admin.Grants;

/// <summary>
/// The group grant endpoints through HTTP on the shared host (CP4.5 contract §2-3): create, bulk, list, priority on
/// PUT, the field errors and 409s of GRP-2..6 / GPG-3, the mixed per-cluster list (UIG-4) and read-only admins.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class GroupGrantsEndpointsTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Create_Returns201_WithGroupGrant_AndListsIt()
    {
        var (cluster, credential) = await SeedAsync();
        var group = NewGroup();
        using var admin = await factory.AdminClientAsync();

        using var response = await CreateGroupAsync(admin, group, cluster, credential, 500, "readWrite");

        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        var body = await response.JsonAsync();
        var id = body.GetProperty("id").GetGuid();
        response.Headers.Location.ShouldBe(new Uri($"/api/admin/grants/{id}", UriKind.Relative));
        body.GetProperty("subjectKind").GetString().ShouldBe("group");
        body.GetProperty("subjectName").GetString().ShouldBe(group);
        body.GetProperty("priority").GetInt32().ShouldBe(500);
        body.GetProperty("username").ValueKind.ShouldBe(JsonValueKind.Null);
        body.GetProperty("userStatus").ValueKind.ShouldBe(JsonValueKind.Null);
        body.GetProperty("accessMode").GetString().ShouldBe("readWrite");

        var listed = (await GroupGrantsAsync(admin, group)).ShouldHaveSingleItem();
        listed.GetProperty("id").GetGuid().ShouldBe(id);
        (await GroupGrantsAsync(admin, NewGroup())).ShouldBeEmpty();
    }

    [Theory]
    [InlineData("System:Authenticated", "groupName", "System groups can't be granted access.")]
    [InlineData("50%-team", "groupName", "Enter a valid group name.")]
    public async Task Create_With_Invalid_Group_Is400_On_GroupName(string group, string field, string message)
    {
        var (cluster, credential) = await SeedAsync();
        using var admin = await factory.AdminClientAsync();

        using var response = await CreateGroupAsync(admin, group, cluster, credential, 1);

        var errors = (await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "Validation.Failed")).GetProperty("errors");
        errors.GetProperty(field)[0].GetString().ShouldBe(message);
    }

    [Fact]
    public async Task Create_With_Missing_Or_OutOfRange_Priority_Is400_On_Priority()
    {
        var (cluster, credential) = await SeedAsync();
        using var admin = await factory.AdminClientAsync();

        using var outOfRange = await CreateGroupAsync(admin, NewGroup(), cluster, credential, 1001);
        using var missing = await admin.PostAsync(
            new Uri($"/api/admin/groups/{NewGroup()}/grants", UriKind.Relative),
            new StringContent($$"""{"clusterName":"{{cluster}}","credentialId":"{{credential}}"}""", System.Text.Encoding.UTF8, "application/json"),
            Ct);

        foreach (var response in new[] { outOfRange, missing })
        {
            var errors = (await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "Validation.Failed")).GetProperty("errors");
            errors.GetProperty("priority")[0].GetString().ShouldBe("Priority must be between 1 and 1000.");
        }
    }

    [Fact]
    public async Task Create_With_Taken_Priority_Or_Existing_Group_Grant_Is409()
    {
        var (cluster, credential) = await SeedAsync();
        var (first, second) = (NewGroup(), NewGroup());
        using var admin = await factory.AdminClientAsync();
        (await CreateGroupAsync(admin, first, cluster, credential, 100)).StatusCode.ShouldBe(HttpStatusCode.Created);

        using var taken = await CreateGroupAsync(admin, second, cluster, credential, 100);
        using var again = await CreateGroupAsync(admin, first, cluster, credential, 200);

        (await taken.ShouldBeProblemAsync(HttpStatusCode.Conflict, "Grants.PriorityTaken"))
            .GetProperty("detail").GetString().ShouldBe($"Priority 100 is already used by group `{first}` on this cluster.");
        await again.ShouldBeProblemAsync(HttpStatusCode.Conflict, "Grants.AlreadyExists");
        (await GroupGrantsAsync(admin, second)).ShouldBeEmpty();
    }

    [Fact]
    public async Task Bulk_Creates_All_Or_Reports_Every_Failing_Item_And_Writes_Nothing()
    {
        var (a, credA) = await SeedAsync();
        var (b, credB) = await SeedAsync();
        var (c, credC) = await SeedAsync();
        var (holder, group) = (NewGroup(), NewGroup());
        using var admin = await factory.AdminClientAsync();
        (await CreateGroupAsync(admin, holder, a, credA, 7)).StatusCode.ShouldBe(HttpStatusCode.Created); // priority 7 taken on a
        (await CreateGroupAsync(admin, group, b, credB, 9)).StatusCode.ShouldBe(HttpStatusCode.Created); // group already on b

        using var failed = await BulkGroupAsync(admin, group, 7, (a, credA), (b, credB), (c, credC));

        var errors = (await failed.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "Validation.Failed")).GetProperty("errors");
        errors.EnumerateObject().Select(p => p.Name).ShouldBe(["items[0].clusterName", "items[1].clusterName"], ignoreOrder: true);
        (await GroupGrantsAsync(admin, group)).ShouldHaveSingleItem().GetProperty("clusterName").GetString().ShouldBe(b);

        using var created = await BulkGroupAsync(admin, NewGroup(), 8, (a, credA), (c, credC));

        created.StatusCode.ShouldBe(HttpStatusCode.OK);
        var grants = (await created.JsonAsync()).EnumerateArray().ToList();
        grants.Select(g => g.GetProperty("clusterName").GetString()).ShouldBe([a, c]);
        grants.ShouldAllBe(g => g.GetProperty("priority").GetInt32() == 8);
    }

    [Fact]
    public async Task Update_Changes_Group_Priority_Refuses_Taken_And_Missing_Priority()
    {
        var (cluster, credential) = await SeedAsync();
        var (other, group) = (NewGroup(), NewGroup());
        using var admin = await factory.AdminClientAsync();
        (await CreateGroupAsync(admin, other, cluster, credential, 70)).StatusCode.ShouldBe(HttpStatusCode.Created);
        using var created = await CreateGroupAsync(admin, group, cluster, credential, 50);
        var grant = await created.JsonAsync();
        var id = grant.GetProperty("id").GetGuid();
        var version = grant.GetProperty("version").GetUInt32();

        using var taken = await UpdateWithPriorityAsync(admin, id, "readOnly", credential, version, 70);
        using var missing = await UpdateWithPriorityAsync(admin, id, "readOnly", credential, version, null);
        using var changed = await UpdateWithPriorityAsync(admin, id, "readOnly", credential, version, 60);

        (await taken.ShouldBeProblemAsync(HttpStatusCode.Conflict, "Grants.PriorityTaken"))
            .GetProperty("detail").GetString().ShouldBe($"Priority 70 is already used by group `{other}` on this cluster.");
        (await missing.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "Validation.Failed"))
            .GetProperty("errors").GetProperty("priority")[0].GetString().ShouldBe("Priority must be between 1 and 1000.");
        changed.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await GroupGrantsAsync(admin, group)).ShouldHaveSingleItem().GetProperty("priority").GetInt32().ShouldBe(60);
    }

    [Fact]
    public async Task Update_User_Grant_With_Priority_Is400_On_Priority()
    {
        var (cluster, credential) = await SeedAsync();
        var user = await factory.OfflineUserAsync();
        await factory.Data.GrantAsync(user, cluster, new CredentialId(credential));
        using var admin = await factory.AdminClientAsync();
        var grant = (await ClusterGrantsAsync(admin, cluster)).ShouldHaveSingleItem();

        using var response = await UpdateWithPriorityAsync(
            admin, grant.GetProperty("id").GetGuid(), "readOnly", credential, grant.GetProperty("version").GetUInt32(), 5);

        (await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "Validation.Failed"))
            .GetProperty("errors").GetProperty("priority")[0].GetString().ShouldBe("Priority applies to group grants only.");
    }

    [Fact]
    public async Task Cluster_Grants_List_Users_First_Then_Groups_With_Subject_Fields()
    {
        var (cluster, credential) = await SeedAsync();
        var user = await factory.OfflineUserAsync();
        await factory.Data.GrantAsync(user, cluster, new CredentialId(credential));
        using var admin = await factory.AdminClientAsync();
        (await CreateGroupAsync(admin, "zz-" + NewGroup(), cluster, credential, 2)).StatusCode.ShouldBe(HttpStatusCode.Created);
        (await CreateGroupAsync(admin, "aa-" + NewGroup(), cluster, credential, 1)).StatusCode.ShouldBe(HttpStatusCode.Created);

        var grants = await ClusterGrantsAsync(admin, cluster);

        grants.Select(g => g.GetProperty("subjectKind").GetString()).ShouldBe(["user", "group", "group"]);
        grants[0].GetProperty("subjectName").GetString().ShouldBe(user);
        grants[0].GetProperty("priority").ValueKind.ShouldBe(JsonValueKind.Null);
        grants[1].GetProperty("subjectName").GetString()!.ShouldStartWith("aa-");
        grants[2].GetProperty("priority").GetInt32().ShouldBe(2);
    }

    [Fact]
    public async Task ReadOnly_Admin_Is_Refused_For_Group_Commands()
    {
        var (cluster, credential) = await SeedAsync();
        using var readOnly = await factory.ReadOnlyAdminClientAsync();

        using var create = await CreateGroupAsync(readOnly, NewGroup(), cluster, credential, 1);
        using var bulk = await BulkGroupAsync(readOnly, NewGroup(), 1, (cluster, credential));

        await create.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "Auth.ReadOnly");
        await bulk.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "Auth.ReadOnly");
        (await GroupGrantsAsync(readOnly, NewGroup())).ShouldBeEmpty();
    }

    private static string NewGroup() => $"g-{TestData.Unique()}";

    private async Task<(string Cluster, Guid Credential)> SeedAsync()
    {
        var cluster = await factory.Data.ClusterAsync();
        var credential = await factory.Data.CredentialAsync(cluster.Name);
        return (cluster.Name, credential.Id.Value);
    }
}
