using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using static FleetConsole.Api.Tests.Integration.Admin.Clusters.ClusterTestSupport;

namespace FleetConsole.Api.Tests.Integration.Admin.Clusters;

/// <summary>
/// <c>GET /api/admin/clusters</c> and <c>GET /api/admin/clusters/{name}</c> (CLU-2, CLU-7): the list roll-ups are
/// computed from one SQL query (this also proves EF Core translates the projection; it would throw on client
/// evaluation) and the detail parses the stored CA bundle.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ClusterQueriesTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task List_ReturnsRollUpsPerCluster()
    {
        var admin = await factory.AdminClientAsync();
        var cluster = await factory.Data.ClusterAsync();
        var user = await factory.OfflineUserAsync();
        var opaque = await factory.Data.CredentialAsync(cluster.Name);
        var soon = await JwtCredentialAsync(factory, cluster.Name, DateTimeOffset.UtcNow.AddDays(3));
        await JwtCredentialAsync(factory, cluster.Name, DateTimeOffset.UtcNow.AddDays(300));
        await factory.Data.GrantAsync(user, cluster.Name, opaque.Id);
        // After seeding, so not before the cluster's ConnectionSettingsChangedAt (registration time).
        var testedAt = DateTimeOffset.UtcNow;
        await RecordTestAsync(factory, cluster.Name, opaque.Id, testedAt.AddMinutes(-5), succeeded: false);
        await RecordTestAsync(factory, cluster.Name, soon, testedAt);

        var item = await admin.GetListItemAsync(cluster.Name);

        item.GetProperty("displayName").GetString().ShouldBe(cluster.Name);
        item.GetProperty("environment").GetString().ShouldBe("staging");
        item.GetProperty("apiUrl").GetString().ShouldBe("https://api.test-cluster.example.com:6443");
        item.GetProperty("isEnabled").GetBoolean().ShouldBeTrue();
        item.GetProperty("tlsMode").GetString().ShouldBe("systemTrust");
        item.GetProperty("credentialCount").GetInt32().ShouldBe(3);
        item.GetProperty("worstCredentialExpiryStatus").GetString().ShouldBe("expiringSoon");
        item.GetProperty("grantCount").GetInt32().ShouldBe(1);
        item.GetProperty("lastTest").GetProperty("succeeded").GetBoolean().ShouldBeTrue();
        item.GetProperty("lastTest").GetProperty("isStale").GetBoolean().ShouldBeFalse();
        item.GetProperty("lastTestCredentialName").GetString().ShouldStartWith("jwt-");
        item.GetProperty("version").GetUInt32().ShouldBeGreaterThan(0u);
    }

    [Fact]
    public async Task List_ClusterWithoutCredentials_HasNullRollUps_AndIsSortedByName()
    {
        var admin = await factory.AdminClientAsync();
        var suffix = TestData.Unique();
        await factory.Data.ClusterAsync($"zz-{suffix}");
        await factory.Data.ClusterAsync($"aa-{suffix}");

        using var response = await admin.GetAsync(new Uri(ClustersPath, UriKind.Relative), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var names = (await response.JsonAsync()).EnumerateArray().Select(i => i.GetProperty("name").GetString()!).ToList();

        names.ShouldBe(names.Order(StringComparer.Ordinal).ToList());
        var item = await admin.GetListItemAsync($"aa-{suffix}");
        item.GetProperty("credentialCount").GetInt32().ShouldBe(0);
        item.GetProperty("worstCredentialExpiryStatus").ValueKind.ShouldBe(JsonValueKind.Null);
        item.GetProperty("lastTest").ValueKind.ShouldBe(JsonValueKind.Null);
        item.GetProperty("lastTestCredentialName").ValueKind.ShouldBe(JsonValueKind.Null);
        item.GetProperty("grantCount").GetInt32().ShouldBe(0);
    }

    [Fact]
    public async Task List_ExpiredCredential_IsWorst()
    {
        var admin = await factory.AdminClientAsync();
        var cluster = await factory.Data.ClusterAsync();
        await factory.Data.CredentialAsync(cluster.Name);
        await JwtCredentialAsync(factory, cluster.Name, DateTimeOffset.UtcNow.AddDays(-1));

        var item = await admin.GetListItemAsync(cluster.Name);

        item.GetProperty("worstCredentialExpiryStatus").GetString().ShouldBe("expired");
    }

    [Fact]
    public async Task Detail_ReturnsCaCertificates_WithExpiryStatus()
    {
        var admin = await factory.AdminClientAsync();
        var name = $"ca-{TestData.Unique()}";
        var bundle = CaPem("Fleet Root CA", DateTimeOffset.UtcNow.AddYears(5)) + CaPem("Fleet Short CA", DateTimeOffset.UtcNow.AddDays(10));
        using var created = await admin.PostAsJsonAsync(ClustersPath, RegisterBody(name, b => b["caBundle"] = bundle), Ct);
        created.StatusCode.ShouldBe(HttpStatusCode.Created);

        var detail = await admin.GetDetailAsync(name);

        detail.GetProperty("tlsMode").GetString().ShouldBe("caBundle");
        detail.GetProperty("caBundle").GetString().ShouldBe(bundle.Trim(), StringCompareShould.IgnoreLineEndings);
        var certs = detail.GetProperty("caCertificates").EnumerateArray().ToList();
        certs.Count.ShouldBe(2);
        certs[0].GetProperty("subject").GetString().ShouldBe("CN=Fleet Root CA");
        certs[0].GetProperty("issuer").GetString().ShouldBe("CN=Fleet Root CA");
        certs[0].GetProperty("expiryStatus").GetString().ShouldBe("ok");
        certs[0].GetProperty("sha256Fingerprint").GetString()!.ShouldMatch("^([0-9A-F]{2}:){31}[0-9A-F]{2}$");
        certs[1].GetProperty("subject").GetString().ShouldBe("CN=Fleet Short CA");
        certs[1].GetProperty("expiryStatus").GetString().ShouldBe("expiringSoon");
        certs[1].GetProperty("notAfter").GetDateTimeOffset().ShouldBeGreaterThan(DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task Detail_WithoutCaBundle_HasEmptyCertificates_AndCounts()
    {
        var admin = await factory.AdminClientAsync();
        var cluster = await factory.Data.ClusterAsync();
        await factory.Data.CredentialAsync(cluster.Name);

        var detail = await admin.GetDetailAsync(cluster.Name);

        detail.GetProperty("caBundle").ValueKind.ShouldBe(JsonValueKind.Null);
        detail.GetProperty("caCertificates").GetArrayLength().ShouldBe(0);
        detail.GetProperty("credentialCount").GetInt32().ShouldBe(1);
        detail.GetProperty("grantCount").GetInt32().ShouldBe(0);
        detail.GetProperty("createdBy").GetString().ShouldBe(TestData.Actor);
        detail.GetProperty("description").GetString().ShouldBe("Seeded by TestData");
    }

    [Theory]
    [InlineData("does-not-exist-anywhere")]
    [InlineData("Not_A_Valid_Name")]
    public async Task Detail_UnknownName_Returns404(string name)
    {
        var admin = await factory.AdminClientAsync();

        using var response = await admin.GetAsync(new Uri(ClusterPath(name), UriKind.Relative), Ct);

        await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "Clusters.NotFound");
    }

    [Fact]
    public async Task List_AsNonAdmin_Returns403()
    {
        var user = await factory.LoginAsAsync(factory.NewUsername());

        using var response = await user.GetAsync(new Uri(ClustersPath, UriKind.Relative), Ct);

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "Auth.Forbidden");
    }
}
