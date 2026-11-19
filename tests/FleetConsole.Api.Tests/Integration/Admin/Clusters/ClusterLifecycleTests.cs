using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using static FleetConsole.Api.Tests.Integration.Admin.Clusters.ClusterTestSupport;

namespace FleetConsole.Api.Tests.Integration.Admin.Clusters;

/// <summary>
/// Enable, disable and delete (CLU-5, CLU-6): transitions keep credentials and grants, delete is refused while enabled
/// and otherwise removes credentials and grants with a <c>cluster.deleted</c> audit entry carrying the counts.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ClusterLifecycleTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task DisableThenEnable_KeepsCredentialsAndGrants_AndAudits()
    {
        var admin = await factory.AdminClientAsync();
        var (cluster, _) = await SeedClusterWithGrantAsync();

        using var disabled = await TransitionAsync(admin, cluster, "disable", await admin.VersionAsync(cluster));
        disabled.StatusCode.ShouldBe(HttpStatusCode.OK);
        var disabledBody = await disabled.JsonAsync();
        disabledBody.GetProperty("isEnabled").GetBoolean().ShouldBeFalse();
        disabledBody.GetProperty("credentialCount").GetInt32().ShouldBe(1);
        disabledBody.GetProperty("grantCount").GetInt32().ShouldBe(1);

        using var enabled = await TransitionAsync(admin, cluster, "enable", disabledBody.GetProperty("version").GetUInt32());
        enabled.StatusCode.ShouldBe(HttpStatusCode.OK);
        var enabledBody = await enabled.JsonAsync();
        enabledBody.GetProperty("isEnabled").GetBoolean().ShouldBeTrue();
        enabledBody.GetProperty("credentialCount").GetInt32().ShouldBe(1);
        enabledBody.GetProperty("grantCount").GetInt32().ShouldBe(1);

        var actions = (await factory.Data.AuditEntriesAsync(cluster)).Select(e => e.Action).ToList();
        actions.ShouldContain("cluster.disabled");
        actions.ShouldContain("cluster.enabled");
    }

    [Theory]
    [InlineData("enable")]
    [InlineData("disable")]
    public async Task Transition_StaleVersion_Returns409(string action)
    {
        var admin = await factory.AdminClientAsync();
        var cluster = await factory.Data.ClusterAsync(isEnabled: action == "disable");

        using var response = await TransitionAsync(admin, cluster.Name, action, await admin.VersionAsync(cluster.Name) + 1);

        await response.ShouldBeProblemAsync(HttpStatusCode.Conflict, "Concurrency.Conflict");
    }

    [Theory]
    [InlineData("enable")]
    [InlineData("disable")]
    public async Task Transition_UnknownCluster_Returns404(string action)
    {
        var admin = await factory.AdminClientAsync();

        using var response = await TransitionAsync(admin, $"missing-{TestData.Unique()}", action, 1);

        await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "Clusters.NotFound");
    }

    [Fact]
    public async Task Enable_AlreadyEnabled_Returns200WithoutAuditEntry()
    {
        var admin = await factory.AdminClientAsync();
        var cluster = await factory.Data.ClusterAsync();

        using var response = await TransitionAsync(admin, cluster.Name, "enable", await admin.VersionAsync(cluster.Name));

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await factory.Data.AuditEntriesAsync(cluster.Name)).ShouldNotContain(e => e.Action == "cluster.enabled");
    }

    [Fact]
    public async Task Delete_EnabledCluster_Returns409NotDisabled()
    {
        var admin = await factory.AdminClientAsync();
        var cluster = await factory.Data.ClusterAsync();

        using var response = await admin.DeleteAsync(new Uri(ClusterPath(cluster.Name), UriKind.Relative), Ct);

        await response.ShouldBeProblemAsync(HttpStatusCode.Conflict, "Clusters.NotDisabled");
        (await admin.GetDetailAsync(cluster.Name)).GetProperty("isEnabled").GetBoolean().ShouldBeTrue();
    }

    [Fact]
    public async Task Delete_DisabledCluster_RemovesCredentialsAndGrants_AndAuditsCounts()
    {
        var admin = await factory.AdminClientAsync();
        var (cluster, clusterId) = await SeedClusterWithGrantAsync();
        await factory.Data.CredentialAsync(cluster);
        (await RowCountsAsync(factory, clusterId)).ShouldBe((2, 1));
        using (var disabled = await TransitionAsync(admin, cluster, "disable", await admin.VersionAsync(cluster)))
        {
            disabled.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        using var response = await admin.DeleteAsync(new Uri(ClusterPath(cluster), UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        using var gone = await admin.GetAsync(new Uri(ClusterPath(cluster), UriKind.Relative), Ct);
        gone.StatusCode.ShouldBe(HttpStatusCode.NotFound);

        // The database cascade removed the credentials (encrypted tokens included) and the grant.
        (await RowCountsAsync(factory, clusterId)).ShouldBe((0, 0));

        var deleted = (await factory.Data.AuditEntriesAsync(cluster)).Single(e => e.Action == "cluster.deleted");
        using var details = JsonDocument.Parse(deleted.DetailsJson);
        details.RootElement.GetProperty("credentialCount").GetInt32().ShouldBe(2);
        details.RootElement.GetProperty("grantCount").GetInt32().ShouldBe(1);
    }

    [Fact]
    public async Task Delete_UnknownCluster_Returns404()
    {
        var admin = await factory.AdminClientAsync();

        using var response = await admin.DeleteAsync(new Uri(ClusterPath($"missing-{TestData.Unique()}"), UriKind.Relative), Ct);

        await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "Clusters.NotFound");
    }

    [Theory]
    [InlineData("enable")]
    [InlineData("disable")]
    [InlineData("delete")]
    public async Task Commands_AsReadOnlyAdmin_Return403(string action)
    {
        var cluster = await factory.Data.ClusterAsync(isEnabled: action != "disable");
        var client = await factory.ReadOnlyAdminClientAsync();

        using var response = action == "delete"
            ? await client.DeleteAsync(new Uri(ClusterPath(cluster.Name), UriKind.Relative), Ct)
            : await TransitionAsync(client, cluster.Name, action, await client.VersionAsync(cluster.Name));

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "Auth.ReadOnly");
    }

    private async Task<(string Cluster, Domain.Clusters.ClusterId Id)> SeedClusterWithGrantAsync()
    {
        var cluster = await factory.Data.ClusterAsync();
        var credential = await factory.Data.CredentialAsync(cluster.Name);
        var user = await factory.OfflineUserAsync();
        await factory.Data.GrantAsync(user, cluster.Name, credential.Id);
        return (cluster.Name, cluster.Id);
    }

    private static Task<HttpResponseMessage> TransitionAsync(HttpClient client, string name, string action, uint version) =>
        client.PostAsJsonAsync($"{ClusterPath(name)}/{action}", new { version }, Ct);
}
