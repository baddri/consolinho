using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Users;

namespace FleetConsole.Api.Tests.Integration.Clusters;

/// <summary>
/// <c>GET /api/clusters</c> — the cluster switcher (contract §6, SW-1, GRANT-6): only enabled clusters the user has a
/// grant on, effective access mode, environment-then-name order, and no connection or credential data beyond the
/// effective credential's inspect-namespace names (NSA-1/3).
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ClustersEndpointsTests(ApiFactory factory)
{
    private static readonly Uri ClustersUri = new("/api/clusters", UriKind.Relative);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Lists_Enabled_Granted_Clusters_Sorted_By_Environment_Then_Name()
    {
        var user = await factory.Data.UserAsync();
        var suffix = TestData.Unique();
        var dev = await GrantedClusterAsync(user.Username, $"a-dev-{suffix}", ClusterEnvironment.Development);
        var prodB = await GrantedClusterAsync(user.Username, $"b-prod-{suffix}", ClusterEnvironment.Production, AccessMode.ReadWrite);
        var stage = await GrantedClusterAsync(user.Username, $"a-stage-{suffix}", ClusterEnvironment.Staging);
        var prodA = await GrantedClusterAsync(user.Username, $"a-prod-{suffix}", ClusterEnvironment.Production);
        await GrantedClusterAsync(user.Username, $"disabled-{suffix}", ClusterEnvironment.Production, isEnabled: false);
        await factory.Data.ClusterAsync(); // not granted
        using var client = await factory.LoginAsAsync(user.Username);

        var clusters = await ListAsync(client);

        clusters.Select(c => c.GetProperty("name").GetString()).ShouldBe([prodA, prodB, stage, dev]);
        clusters.Select(c => c.GetProperty("environment").GetString())
            .ShouldBe(["production", "production", "staging", "development"]);
        clusters.Select(c => c.GetProperty("accessMode").GetString())
            .ShouldBe(["readOnly", "readWrite", "readOnly", "readOnly"]);
    }

    [Fact]
    public async Task Exposes_Only_Switcher_Fields()
    {
        var user = await factory.Data.UserAsync();
        await GrantedClusterAsync(user.Username, $"c-{TestData.Unique()}", ClusterEnvironment.Staging);
        using var client = await factory.LoginAsAsync(user.Username);

        var cluster = (await ListAsync(client)).ShouldHaveSingleItem();

        cluster.EnumerateObject().Select(p => p.Name)
            .ShouldBe(["name", "displayName", "environment", "distribution", "accessMode", "webConsoleUrl", "fallbackNamespaces"], ignoreOrder: true);
    }

    [Fact]
    public async Task Returns_The_Effective_Credentials_Inspect_Namespaces_In_Saved_Order()
    {
        var user = await factory.Data.UserAsync();
        var suffix = TestData.Unique();
        var withNamespaces = await GrantedClusterAsync(
            user.Username, $"a-ns-{suffix}", ClusterEnvironment.Staging, inspectNamespaces: ["team-b", "team-a"]);
        var without = await GrantedClusterAsync(user.Username, $"b-none-{suffix}", ClusterEnvironment.Staging);
        using var client = await factory.LoginAsAsync(user.Username);

        var clusters = await ListAsync(client);

        clusters.Select(c => (c.GetProperty("name").GetString(), string.Join(',', c.GetProperty("fallbackNamespaces").EnumerateArray().Select(e => e.GetString()))))
            .ShouldBe([(withNamespaces, "team-b,team-a"), (without, "")]);
        clusters[1].GetProperty("fallbackNamespaces").ValueKind.ShouldBe(JsonValueKind.Array);
    }

    [Fact]
    public async Task OpenApi_Publishes_FallbackNamespaces_As_A_Required_Documented_String_Array()
    {
        using var client = factory.CreateApiClient();
        using var response = await client.GetAsync(new Uri("/openapi/v1.json", UriKind.Relative), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var schema = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct))
            .GetProperty("components").GetProperty("schemas").GetProperty("AccessibleCluster");

        schema.GetProperty("required").EnumerateArray().Select(e => e.GetString()).ShouldContain("fallbackNamespaces");
        var property = schema.GetProperty("properties").GetProperty("fallbackNamespaces");
        property.GetProperty("type").GetString().ShouldBe("array");
        property.GetProperty("items").GetProperty("type").GetString().ShouldBe("string");
        property.GetProperty("description").GetString().ShouldNotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task Returns_The_Declared_Distribution()
    {
        var user = await factory.Data.UserAsync();
        var suffix = TestData.Unique();
        var ocp = await GrantedClusterAsync(user.Username, $"a-ocp-{suffix}", ClusterEnvironment.Staging);
        var k8s = await GrantedClusterAsync(
            user.Username, $"b-k8s-{suffix}", ClusterEnvironment.Staging, distribution: ClusterDistribution.Kubernetes);
        using var client = await factory.LoginAsAsync(user.Username);

        var clusters = await ListAsync(client);

        clusters.Select(c => (c.GetProperty("name").GetString(), c.GetProperty("distribution").GetString()))
            .ShouldBe([(ocp, "openShift"), (k8s, "kubernetes")]);
    }

    [Fact]
    public async Task Globally_ReadOnly_User_Gets_ReadOnly_Effective_Mode()
    {
        var user = await factory.Data.UserAsync(isReadOnly: true);
        await GrantedClusterAsync(user.Username, $"c-{TestData.Unique()}", ClusterEnvironment.Staging, AccessMode.ReadWrite);
        using var client = await factory.LoginAsAsync(user.Username);

        var cluster = (await ListAsync(client)).ShouldHaveSingleItem();

        cluster.GetProperty("accessMode").GetString().ShouldBe("readOnly");
    }

    [Fact]
    public async Task Admin_Without_Grants_Gets_Empty_List()
    {
        var admin = await factory.Data.UserAsync(role: UserRole.Admin);
        using var client = await factory.LoginAsAsync(admin.Username);

        (await ListAsync(client)).ShouldBeEmpty();
    }

    [Fact]
    public async Task Deactivated_User_Sees_No_Clusters()
    {
        var user = await factory.Data.UserAsync();
        await GrantedClusterAsync(user.Username, $"c-{TestData.Unique()}", ClusterEnvironment.Staging);
        using var client = await factory.LoginAsAsync(user.Username);
        await factory.Data.DeactivateAsync(user.Username);

        using var response = await client.GetAsync(ClustersUri, Ct);

        // Deactivation ends the session (security stamp); until the session is revalidated the query itself filters
        // the deactivated user's grants. Either way nothing is listed.
        if (response.StatusCode == HttpStatusCode.OK)
        {
            (await response.JsonAsync()).GetArrayLength().ShouldBe(0);
        }
        else
        {
            await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "Auth.Unauthenticated");
        }
    }

    [Fact]
    public async Task Anonymous_Is401()
    {
        using var client = factory.CreateBrowserClient();

        using var response = await client.GetAsync(ClustersUri, Ct);

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "Auth.Unauthenticated");
    }

    // Registers a cluster with a credential and grants it to the user; returns the cluster name.
    private async Task<string> GrantedClusterAsync(
        string username,
        string name,
        ClusterEnvironment environment,
        AccessMode mode = AccessMode.ReadOnly,
        bool isEnabled = true,
        ClusterDistribution distribution = ClusterDistribution.OpenShift,
        IReadOnlyList<string>? inspectNamespaces = null)
    {
        var cluster = await factory.Data.ClusterAsync(name, isEnabled, environment, distribution);
        var credential = await factory.Data.CredentialAsync(cluster.Name, inspectNamespaces: inspectNamespaces);
        await factory.Data.GrantAsync(username, cluster.Name, credential.Id, mode);
        return cluster.Name;
    }

    private static async Task<IReadOnlyList<JsonElement>> ListAsync(HttpClient client)
    {
        using var response = await client.GetAsync(ClustersUri, Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return [.. (await response.JsonAsync()).EnumerateArray()];
    }
}
