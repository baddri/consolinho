using System.Net;
using System.Text.Json;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using static FleetConsole.Api.Tests.Integration.Admin.Grants.GrantsApi;

namespace FleetConsole.Api.Tests.Integration.Admin.Grants;

/// <summary>
/// The grant endpoints through HTTP on the shared host (contract §9, GRANT-1..5): create, change, revoke, bulk
/// all-or-nothing, the per-user and per-cluster lists with their state markers, authorization and CRED-2.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class GrantsEndpointsTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Create_Returns201_WithGrant_AndAudits()
    {
        var (user, cluster, credential) = await SeedAsync();
        using var admin = await factory.AdminClientAsync();

        using var response = await CreateAsync(admin, user, cluster, credential.Id.Value, "readWrite");

        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        var body = await response.JsonAsync();
        var id = body.GetProperty("id").GetGuid();
        response.Headers.Location.ShouldBe(new Uri($"/api/admin/grants/{id}", UriKind.Relative));
        body.GetProperty("username").GetString().ShouldBe(user);
        body.GetProperty("userStatus").GetString().ShouldBe("pending");
        body.GetProperty("clusterName").GetString().ShouldBe(cluster);
        body.GetProperty("clusterEnvironment").GetString().ShouldBe("staging");
        body.GetProperty("clusterIsEnabled").GetBoolean().ShouldBeTrue();
        body.GetProperty("credentialId").GetGuid().ShouldBe(credential.Id.Value);
        body.GetProperty("credentialName").GetString().ShouldBe(credential.Name);
        body.GetProperty("accessMode").GetString().ShouldBe("readWrite");
        body.GetProperty("updatedAt").ValueKind.ShouldBe(JsonValueKind.Null);
        body.GetProperty("version").GetUInt32().ShouldBeGreaterThan(0u);

        var audit = (await GrantAuditAsync(factory, user)).ShouldHaveSingleItem();
        audit.Action.ShouldBe("grant.created");
        audit.ClusterName.ShouldBe(cluster);
    }

    [Fact]
    public async Task Create_Defaults_To_ReadOnly()
    {
        var (user, cluster, credential) = await SeedAsync();
        using var admin = await factory.AdminClientAsync();

        using var response = await admin.PostAsync(
            new Uri(GrantsPath, UriKind.Relative),
            JsonContent($$"""{"username":"{{user}}","clusterName":"{{cluster}}","credentialId":"{{credential.Id.Value}}"}"""),
            Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        (await response.JsonAsync()).GetProperty("accessMode").GetString().ShouldBe("readOnly");
    }

    [Fact]
    public async Task Create_Second_Grant_Is409_AlreadyExists()
    {
        var (user, cluster, credential) = await SeedAsync();
        await factory.Data.GrantAsync(user, cluster, credential.Id);
        using var admin = await factory.AdminClientAsync();

        using var response = await CreateAsync(admin, user, cluster, credential.Id.Value);

        var body = await response.ShouldBeProblemAsync(HttpStatusCode.Conflict, "Grants.AlreadyExists");
        body.GetProperty("detail").GetString()
            .ShouldBe($"{user} already has access to {cluster} — change the existing grant instead.");
    }

    [Fact]
    public async Task Create_With_Unknown_References_Is400_On_Each_Field()
    {
        using var admin = await factory.AdminClientAsync();

        using var response = await CreateAsync(admin, "no-such-user", "no-such-cluster", Guid.NewGuid());

        var errors = (await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "Validation.Failed")).GetProperty("errors");
        errors.GetProperty("username")[0].GetString().ShouldBe("User no-such-user doesn't exist.");
        errors.GetProperty("clusterName")[0].GetString().ShouldBe("Cluster no-such-cluster doesn't exist.");
        errors.GetProperty("credentialId")[0].GetString().ShouldBe("Credential doesn't exist.");
    }

    [Fact]
    public async Task Create_With_Credential_Of_Another_Cluster_Is400_On_CredentialId()
    {
        var (user, cluster, _) = await SeedAsync();
        var other = await factory.Data.ClusterAsync();
        var foreign = await factory.Data.CredentialAsync(other.Name);
        using var admin = await factory.AdminClientAsync();

        using var response = await CreateAsync(admin, user, cluster, foreign.Id.Value);

        var errors = (await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "Validation.Failed")).GetProperty("errors");
        errors.GetProperty("credentialId")[0].GetString().ShouldBe("This credential belongs to another cluster.");
        (await GrantCountAsync(factory, user)).ShouldBe(0);
    }

    [Fact]
    public async Task Update_Changes_Mode_And_Credential_And_Audits_OldToNew()
    {
        var (user, cluster, view) = await SeedAsync();
        var edit = await factory.Data.CredentialAsync(cluster);
        var grantId = (await factory.Data.GrantAsync(user, cluster, view.Id)).Value;
        using var admin = await factory.AdminClientAsync();
        var version = (await UserGrantsAsync(admin, user)).Single().GetProperty("version").GetUInt32();

        using var response = await UpdateAsync(admin, grantId, "readWrite", edit.Id.Value, version);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var body = await response.JsonAsync();
        body.GetProperty("accessMode").GetString().ShouldBe("readWrite");
        body.GetProperty("credentialName").GetString().ShouldBe(edit.Name);
        body.GetProperty("updatedBy").GetString().ShouldNotBeNullOrEmpty();
        body.GetProperty("version").GetUInt32().ShouldNotBe(version);

        var changed = (await GrantAuditAsync(factory, user)).Single(e => e.Action == "grant.changed");
        using var details = JsonDocument.Parse(changed.DetailsJson);
        details.RootElement.GetProperty("oldAccessMode").GetString().ShouldBe("readOnly");
        details.RootElement.GetProperty("newAccessMode").GetString().ShouldBe("readWrite");
        details.RootElement.GetProperty("oldCredential").GetString().ShouldBe(view.Name);
        details.RootElement.GetProperty("newCredential").GetString().ShouldBe(edit.Name);

        // The pre-change version is stale now.
        using var stale = await UpdateAsync(admin, grantId, "readOnly", view.Id.Value, version);
        await stale.ShouldBeProblemAsync(HttpStatusCode.Conflict, "Concurrency.Conflict");
    }

    [Fact]
    public async Task Update_Without_Change_Writes_No_Audit_Entry()
    {
        var (user, cluster, view) = await SeedAsync();
        var grantId = (await factory.Data.GrantAsync(user, cluster, view.Id)).Value;
        using var admin = await factory.AdminClientAsync();
        var version = (await UserGrantsAsync(admin, user)).Single().GetProperty("version").GetUInt32();

        using var response = await UpdateAsync(admin, grantId, "readOnly", view.Id.Value, version);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await GrantAuditAsync(factory, user)).ShouldNotContain(e => e.Action == "grant.changed");
    }

    [Fact]
    public async Task Update_To_Foreign_Credential_Is400_And_Unknown_Grant_Is404()
    {
        var (user, cluster, view) = await SeedAsync();
        var other = await factory.Data.ClusterAsync();
        var foreign = await factory.Data.CredentialAsync(other.Name);
        var grantId = (await factory.Data.GrantAsync(user, cluster, view.Id)).Value;
        using var admin = await factory.AdminClientAsync();
        var version = (await UserGrantsAsync(admin, user)).Single().GetProperty("version").GetUInt32();

        using var foreignResponse = await UpdateAsync(admin, grantId, "readOnly", foreign.Id.Value, version);
        using var unknownResponse = await UpdateAsync(admin, Guid.NewGuid(), "readOnly", view.Id.Value, version);

        await foreignResponse.ShouldBeFieldErrorAsync("credentialId");
        await unknownResponse.ShouldBeProblemAsync(HttpStatusCode.NotFound, "Grants.NotFound");
    }

    [Fact]
    public async Task Revoke_Returns204_Audits_And_Then404()
    {
        var (user, cluster, view) = await SeedAsync();
        var grantId = (await factory.Data.GrantAsync(user, cluster, view.Id, Domain.Access.AccessMode.ReadWrite)).Value;
        using var admin = await factory.AdminClientAsync();

        using var response = await RevokeAsync(admin, grantId);
        using var again = await RevokeAsync(admin, grantId);

        response.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        await again.ShouldBeProblemAsync(HttpStatusCode.NotFound, "Grants.NotFound");
        (await GrantCountAsync(factory, user)).ShouldBe(0);
        var revoked = (await GrantAuditAsync(factory, user)).Single(e => e.Action == "grant.revoked");
        revoked.DetailsJson.ShouldContain(view.Name);
    }

    [Fact]
    public async Task Bulk_Creates_All_Grants_In_Request_Order_With_One_Audit_Entry_Each()
    {
        var user = await factory.OfflineUserAsync();
        var clusters = new List<(string Name, Guid Credential)>();
        for (var i = 0; i < 3; i++)
        {
            var cluster = await factory.Data.ClusterAsync();
            clusters.Add((cluster.Name, (await factory.Data.CredentialAsync(cluster.Name)).Id.Value));
        }

        using var admin = await factory.AdminClientAsync();
        var auditBefore = (await GrantAuditAsync(factory, user)).Count;

        using var response = await BulkAsync(admin, user, "readOnly", [.. clusters]);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var body = await response.JsonAsync();
        body.EnumerateArray().Select(g => g.GetProperty("clusterName").GetString()).ShouldBe(clusters.Select(c => c.Name));
        body.EnumerateArray().ShouldAllBe(g => g.GetProperty("version").GetUInt32() > 0);
        (await GrantCountAsync(factory, user)).ShouldBe(3);
        var audit = await GrantAuditAsync(factory, user);
        (audit.Count - auditBefore).ShouldBe(3);
        audit.ShouldAllBe(e => e.Action == "grant.created");
    }

    [Fact]
    public async Task Bulk_With_Bad_Items_Is400_Listing_Every_Item_And_Writes_Nothing()
    {
        var (user, granted, grantedCredential) = await SeedAsync();
        await factory.Data.GrantAsync(user, granted, grantedCredential.Id);
        var good = await factory.Data.ClusterAsync();
        var goodCredential = await factory.Data.CredentialAsync(good.Name);
        var foreign = await factory.Data.CredentialAsync(granted);
        using var admin = await factory.AdminClientAsync();
        var grantsBefore = await GrantCountAsync(factory, user);
        var auditBefore = (await GrantAuditAsync(factory, user)).Count;

        using var response = await BulkAsync(
            admin,
            user,
            "readWrite",
            (good.Name, goodCredential.Id.Value),
            ("no-such-cluster", goodCredential.Id.Value),
            (good.Name + "x", Guid.NewGuid()),
            (granted, grantedCredential.Id.Value));

        var errors = (await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "Validation.Failed")).GetProperty("errors");
        errors.GetProperty("items[1].clusterName")[0].GetString().ShouldBe("Cluster no-such-cluster doesn't exist.");
        errors.GetProperty("items[2].clusterName")[0].GetString().ShouldBe($"Cluster {good.Name}x doesn't exist.");
        errors.GetProperty("items[2].credentialId")[0].GetString().ShouldBe("Credential doesn't exist.");
        errors.GetProperty("items[3].clusterName")[0].GetString().ShouldBe($"{user} already has access to {granted}.");
        errors.EnumerateObject().ShouldNotContain(p => p.Name.StartsWith("items[0]", StringComparison.Ordinal));
        (await GrantCountAsync(factory, user)).ShouldBe(grantsBefore);
        (await GrantAuditAsync(factory, user)).Count.ShouldBe(auditBefore);

        // A credential of another cluster is reported on the item's credentialId.
        using var mismatch = await BulkAsync(admin, user, "readOnly", (good.Name, foreign.Id.Value));
        await mismatch.ShouldBeFieldErrorAsync("items[0].credentialId");
        (await GrantCountAsync(factory, user)).ShouldBe(grantsBefore);
    }

    [Fact]
    public async Task Bulk_Rejects_Duplicates_Empty_Lists_And_Unknown_Users()
    {
        var (user, cluster, credential) = await SeedAsync();
        using var admin = await factory.AdminClientAsync();

        using var duplicate = await BulkAsync(admin, user, "readOnly", (cluster, credential.Id.Value), (cluster, credential.Id.Value));
        using var empty = await BulkAsync(admin, user, "readOnly");
        using var unknownUser = await BulkAsync(admin, "no-such-user", "readOnly", (cluster, credential.Id.Value));

        var errors = (await duplicate.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "Validation.Failed")).GetProperty("errors");
        errors.GetProperty("items[1].clusterName")[0].GetString().ShouldBe("Cluster listed twice.");
        await empty.ShouldBeFieldErrorAsync("items");
        await unknownUser.ShouldBeProblemAsync(HttpStatusCode.NotFound, "Users.NotFound");
        (await GrantCountAsync(factory, user)).ShouldBe(0);
    }

    [Fact]
    public async Task Lists_Keep_And_Mark_Disabled_Clusters_Deactivated_Users_And_Expired_Credentials()
    {
        var user = await factory.OfflineUserAsync();
        var disabled = await factory.Data.ClusterAsync(isEnabled: false);
        var expiredCluster = await factory.Data.ClusterAsync();
        var disabledCredential = await factory.Data.CredentialAsync(disabled.Name);
        var expired = await ClusterTestSupport.JwtCredentialAsync(factory, expiredCluster.Name, DateTimeOffset.UtcNow.AddDays(-1));
        await factory.Data.GrantAsync(user, disabled.Name, disabledCredential.Id);
        await factory.Data.GrantAsync(user, expiredCluster.Name, expired);
        await factory.Data.DeactivateAsync(user);
        using var admin = await factory.AdminClientAsync();

        var userGrants = await UserGrantsAsync(admin, user);
        var clusterGrants = await ClusterGrantsAsync(admin, expiredCluster.Name);

        userGrants.Select(g => g.GetProperty("clusterName").GetString())
            .ShouldBe(new[] { disabled.Name, expiredCluster.Name }.Order(StringComparer.Ordinal));
        userGrants.ShouldAllBe(g => g.GetProperty("userStatus").GetString() == "deactivated");
        userGrants.Single(g => g.GetProperty("clusterName").GetString() == disabled.Name)
            .GetProperty("clusterIsEnabled").GetBoolean().ShouldBeFalse();
        var expiredGrant = clusterGrants.ShouldHaveSingleItem();
        expiredGrant.GetProperty("credentialExpiryStatus").GetString().ShouldBe("expired");
        expiredGrant.GetProperty("credentialExpiresAt").ValueKind.ShouldBe(JsonValueKind.String);
        expiredGrant.GetProperty("username").GetString().ShouldBe(user);
    }

    [Fact]
    public async Task Lists_Of_Unknown_User_Or_Cluster_Are404()
    {
        using var admin = await factory.AdminClientAsync();

        using var user = await admin.GetAsync(new Uri("/api/admin/users/no-such-user/grants", UriKind.Relative), Ct);
        using var cluster = await admin.GetAsync(new Uri("/api/admin/clusters/no-such-cluster/grants", UriKind.Relative), Ct);

        await user.ShouldBeProblemAsync(HttpStatusCode.NotFound, "Users.NotFound");
        await cluster.ShouldBeProblemAsync(HttpStatusCode.NotFound, "Clusters.NotFound");
    }

    [Fact]
    public async Task ReadOnly_Admin_May_List_But_Not_Change_Grants()
    {
        var (user, cluster, credential) = await SeedAsync();
        var grantId = (await factory.Data.GrantAsync(user, cluster, credential.Id)).Value;
        using var readOnly = await factory.ReadOnlyAdminClientAsync();

        (await UserGrantsAsync(readOnly, user)).ShouldHaveSingleItem();
        using var create = await CreateAsync(readOnly, user, cluster, credential.Id.Value);
        using var update = await UpdateAsync(readOnly, grantId, "readWrite", credential.Id.Value, 1);
        using var revoke = await RevokeAsync(readOnly, grantId);
        using var bulk = await BulkAsync(readOnly, user, "readOnly", (cluster, credential.Id.Value));

        foreach (var response in new[] { create, update, revoke, bulk })
        {
            await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "Auth.ReadOnly");
        }

        (await GrantCountAsync(factory, user)).ShouldBe(1);
    }

    [Fact]
    public async Task Non_Admin_Is403_Forbidden()
    {
        using var client = await factory.LoginAsAsync(factory.NewUsername());

        using var list = await client.GetAsync(new Uri("/api/admin/clusters/any/grants", UriKind.Relative), Ct);
        using var create = await CreateAsync(client, "alice", "any", Guid.NewGuid());

        await list.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "Auth.Forbidden");
        await create.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "Auth.Forbidden");
    }

    [Fact]
    public async Task Grant_Responses_Never_Contain_The_Token()
    {
        var (user, cluster, credential) = await SeedAsync();
        using var admin = await factory.AdminClientAsync();

        using var created = await CreateAsync(admin, user, cluster, credential.Id.Value);
        var createdBody = await created.Content.ReadAsStringAsync(Ct);
        var bodies = new[]
        {
            createdBody,
            JsonSerializer.Serialize(await UserGrantsAsync(admin, user)),
            JsonSerializer.Serialize(await ClusterGrantsAsync(admin, cluster)),
        };

        TokenLeakScanner.AssertAbsent(credential.Token, [.. bodies, factory.Logs.AllText]);
    }

    // A grantee who never logs in, a staging cluster and one credential of it.
    private async Task<(string User, string Cluster, SeededCredential Credential)> SeedAsync()
    {
        var user = await factory.OfflineUserAsync();
        var cluster = await factory.Data.ClusterAsync();
        var credential = await factory.Data.CredentialAsync(cluster.Name);
        return (user, cluster.Name, credential);
    }

    private static StringContent JsonContent(string json) => new(json, System.Text.Encoding.UTF8, "application/json");
}
