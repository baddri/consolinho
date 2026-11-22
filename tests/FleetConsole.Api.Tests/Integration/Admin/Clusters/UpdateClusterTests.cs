using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using static FleetConsole.Api.Tests.Integration.Admin.Clusters.ClusterTestSupport;

namespace FleetConsole.Api.Tests.Integration.Admin.Clusters;

/// <summary>
/// <c>PUT /api/admin/clusters/{name}</c> (CLU-4): full replacement with a version check, connection changes mark
/// earlier credential tests stale while other edits don't, and the <c>cluster.updated</c> audit entry lists changed
/// field names but never CA content (AUD-1).
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class UpdateClusterTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Update_ReturnsDetailWithNewVersion_AndAuditsChangedFieldNames()
    {
        var admin = await factory.AdminClientAsync();
        var cluster = await factory.Data.ClusterAsync();
        var version = await admin.VersionAsync(cluster.Name);

        using var response = await PutAsync(admin, cluster.Name, UpdateBody(version, b =>
        {
            b["displayName"] = "Renamed";
            b["environment"] = "development";
            b["distribution"] = "kubernetes";
            b["webConsoleUrl"] = "https://console.example.com";
        }));

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var body = await response.JsonAsync();
        body.GetProperty("displayName").GetString().ShouldBe("Renamed");
        body.GetProperty("environment").GetString().ShouldBe("development");
        body.GetProperty("distribution").GetString().ShouldBe("kubernetes");
        body.GetProperty("updatedBy").GetString().ShouldNotBeNull();
        var newVersion = body.GetProperty("version").GetUInt32();
        newVersion.ShouldNotBe(version);
        newVersion.ShouldBe(await admin.VersionAsync(cluster.Name));

        var updated = (await factory.Data.AuditEntriesAsync(cluster.Name)).Single(e => e.Action == "cluster.updated");
        using var details = JsonDocument.Parse(updated.DetailsJson);
        details.RootElement.GetProperty("changedFields").EnumerateArray().Select(f => f.GetString())
            .ShouldBe(["displayName", "environment", "distribution", "webConsoleUrl"]);
    }

    [Fact]
    public async Task Update_CaBundle_AuditsFieldNameButNeverCaContent()
    {
        var admin = await factory.AdminClientAsync();
        var cluster = await factory.Data.ClusterAsync();
        var bundle = CaPem("Audit CA", DateTimeOffset.UtcNow.AddYears(2));

        using var response = await PutAsync(admin, cluster.Name, UpdateBody(await admin.VersionAsync(cluster.Name), b => b["caBundle"] = bundle));

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var updated = (await factory.Data.AuditEntriesAsync(cluster.Name)).Single(e => e.Action == "cluster.updated");
        updated.DetailsJson.ShouldContain("caBundle");
        var base64Line = bundle.Split('\n')[1];
        updated.DetailsJson.ShouldNotContain(base64Line);
        updated.Summary.ShouldNotContain(base64Line);
        updated.DetailsJson.ShouldNotContain("BEGIN CERTIFICATE");
    }

    [Fact]
    public async Task Update_IdenticalValues_Returns200WithoutAuditEntry()
    {
        var admin = await factory.AdminClientAsync();
        var cluster = await factory.Data.ClusterAsync();
        var version = await admin.VersionAsync(cluster.Name);

        using var response = await PutAsync(admin, cluster.Name, UpdateBody(version));

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await response.JsonAsync()).GetProperty("version").GetUInt32().ShouldBe(version);
        (await factory.Data.AuditEntriesAsync(cluster.Name)).ShouldNotContain(e => e.Action == "cluster.updated");
    }

    [Theory]
    [InlineData("apiUrl", "https://api.moved.example.com:6443", true)]
    [InlineData("skipTlsVerify", true, true)]
    [InlineData("caBundle", "<generated>", true)]
    [InlineData("displayName", "Other name", false)]
    [InlineData("description", "Other description", false)]
    [InlineData("environment", "production", false)]
    [InlineData("distribution", "kubernetes", false)]
    public async Task Update_OnlyConnectionChanges_MarkLastTestStale(string field, object value, bool stale)
    {
        var admin = await factory.AdminClientAsync();
        var cluster = await factory.Data.ClusterAsync();
        var credential = await factory.Data.CredentialAsync(cluster.Name);
        await RecordTestAsync(factory, cluster.Name, credential.Id, DateTimeOffset.UtcNow);
        (await admin.GetListItemAsync(cluster.Name)).GetProperty("lastTest").GetProperty("isStale").GetBoolean().ShouldBeFalse();
        var newValue = value is "<generated>" ? CaPem("Stale CA", DateTimeOffset.UtcNow.AddYears(1)) : value;

        using var response = await PutAsync(admin, cluster.Name, UpdateBody(await admin.VersionAsync(cluster.Name), b => b[field] = newValue));

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await admin.GetListItemAsync(cluster.Name)).GetProperty("lastTest").GetProperty("isStale").GetBoolean().ShouldBe(stale);
    }

    [Fact]
    public async Task Update_StaleVersion_Returns409()
    {
        var admin = await factory.AdminClientAsync();
        var cluster = await factory.Data.ClusterAsync();
        var version = await admin.VersionAsync(cluster.Name);

        using var response = await PutAsync(admin, cluster.Name, UpdateBody(version + 1, b => b["displayName"] = "Late"));

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.Conflict, "Concurrency.Conflict");
        problem.GetProperty("detail").GetString().ShouldBe("This cluster was changed by someone else. Reload and try again.");
    }

    [Fact]
    public async Task Update_UnknownCluster_Returns404()
    {
        var admin = await factory.AdminClientAsync();

        using var response = await PutAsync(admin, $"missing-{TestData.Unique()}", UpdateBody(1));

        await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "Clusters.NotFound");
    }

    [Theory]
    [InlineData("apiUrl", "http://api.example.com")]
    [InlineData("apiUrl", "https://api.example.com/path")]
    [InlineData("caBundle", "garbage")]
    [InlineData("displayName", "<long>")]
    [InlineData("webConsoleUrl", "ftp://console.example.com")]
    public async Task Update_InvalidField_Returns400(string field, string value)
    {
        var admin = await factory.AdminClientAsync();
        var cluster = await factory.Data.ClusterAsync();

        using var response = await PutAsync(admin, cluster.Name, UpdateBody(
            await admin.VersionAsync(cluster.Name), b => b[field] = value == "<long>" ? new string('n', 101) : value));

        await response.ShouldBeFieldErrorAsync(field);
    }

    [Fact]
    public async Task Update_MissingEnvironment_Returns400()
    {
        var admin = await factory.AdminClientAsync();
        var cluster = await factory.Data.ClusterAsync();

        using var response = await PutAsync(admin, cluster.Name, UpdateBody(await admin.VersionAsync(cluster.Name), b => b.Remove("environment")));

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, code: null);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Update_MissingOrNullDistribution_Returns400OnDistribution(bool missing)
    {
        var admin = await factory.AdminClientAsync();
        var cluster = await factory.Data.ClusterAsync();

        using var response = await PutAsync(admin, cluster.Name, UpdateBody(await admin.VersionAsync(cluster.Name), b =>
        {
            if (missing)
            {
                b.Remove("distribution");
            }
            else
            {
                b["distribution"] = null;
            }
        }));

        await response.ShouldBeFieldErrorAsync("distribution");
    }

    [Fact]
    public async Task Update_AsReadOnlyAdmin_Returns403()
    {
        var cluster = await factory.Data.ClusterAsync();
        var client = await factory.ReadOnlyAdminClientAsync();

        using var response = await PutAsync(client, cluster.Name, UpdateBody(await client.VersionAsync(cluster.Name)));

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "Auth.ReadOnly");
    }

    private static Task<HttpResponseMessage> PutAsync(HttpClient client, string name, Dictionary<string, object?> body) =>
        client.PutAsJsonAsync(ClusterPath(name), body, Ct);
}
