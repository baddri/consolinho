using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Credentials.Tokens;
using FleetConsole.Domain.Access;
using static FleetConsole.Api.Tests.Integration.Admin.Credentials.CredentialApi;

namespace FleetConsole.Api.Tests.Integration.Admin.ConnectionTests;

/// <summary>
/// The connection-test endpoints through HTTP against a <see cref="FakeKubeApiServer"/> with real TLS (QG-2, TEST-1..5,
/// contract §8.4–§8.5): success with a CA bundle, unknown authority, rejected token, disabled clusters, the stored last
/// test and its staleness (CLU-4), the audit entries, unsaved tokens changing nothing, authorization and CRED-2.
/// </summary>
/// <remarks>Each test starts its own fake API server (cheap) and registers its own cluster through the API.</remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ConnectionTestEndpointsTests(ApiFactory factory)
{
    private const string Subject = "system:serviceaccount:fleet:viewer";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task TestCredential_WithCaBundle_Succeeds_IsStored_Audited_AndBecomesStaleAfterApiUrlChange()
    {
        await using var server = await HealthyServerAsync();
        using var admin = await factory.AdminClientAsync();
        var cluster = await RegisterAsync(admin, server);
        var token = Jwt(Subject);
        var credential = await AddOkAsync(admin, cluster, token);
        var credentialName = credential.GetProperty("name").GetString()!;
        var credentialId = credential.GetProperty("id").GetGuid();

        using var response = await TestCredentialAsync(admin, cluster, credentialId, "team-a");

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var resultText = await response.Content.ReadAsStringAsync(Ct);
        var result = JsonDocument.Parse(resultText).RootElement;
        result.GetProperty("succeeded").GetBoolean().ShouldBeTrue();
        result.GetProperty("steps").EnumerateArray().Select(s => s.GetProperty("step").GetString())
            .ShouldBe(["reachability", "authentication", "identity", "openShiftVersion", "capabilities"]);
        result.GetProperty("steps").EnumerateArray().ShouldAllBe(s => s.GetProperty("status").GetString() == "passed");
        result.GetProperty("steps")[0].GetProperty("message").GetString().ShouldBe("Reachable, Kubernetes v1.31.4");
        result.GetProperty("kubernetesVersion").GetString().ShouldBe("v1.31.4");
        result.GetProperty("identity").GetProperty("username").GetString().ShouldBe(Subject);
        result.GetProperty("identity").GetProperty("source").GetString().ShouldBe("selfSubjectReview");
        result.GetProperty("openShiftVersion").GetProperty("version").GetString().ShouldBe("4.17.3");
        var capabilities = result.GetProperty("capabilities");
        capabilities.GetProperty("headline").GetString().ShouldBe("clusterWideView");
        var listPods = capabilities.GetProperty("checks")[0];
        listPods.GetProperty("id").GetString().ShouldBe("list-pods");
        listPods.GetProperty("category").GetString().ShouldBe("read");
        listPods.GetProperty("allowed").GetBoolean().ShouldBeTrue();
        result.GetProperty("namespaceRules").GetProperty("namespace").GetString().ShouldBe("team-a");
        result.GetProperty("hints").GetArrayLength().ShouldBe(0);
        server.Requests.ShouldContain(r => r.Path == "/version" && r.Authorization == $"Bearer {token}");

        var lastTest = await LastTestAsync(admin, cluster, credentialId);
        lastTest.GetProperty("succeeded").GetBoolean().ShouldBeTrue();
        lastTest.GetProperty("failedStep").ValueKind.ShouldBe(JsonValueKind.Null);
        lastTest.GetProperty("headline").GetString().ShouldBe("clusterWideView");
        lastTest.GetProperty("isStale").GetBoolean().ShouldBeFalse();

        var audit = (await factory.Data.AuditEntriesAsync(credentialName)).Where(e => e.Action == "credential.tested").ShouldHaveSingleItem();
        using (var details = JsonDocument.Parse(audit.DetailsJson))
        {
            details.RootElement.GetProperty("succeeded").GetBoolean().ShouldBeTrue();
            details.RootElement.GetProperty("headline").GetString().ShouldBe("clusterWideView");
        }

        // CLU-4: changing the API URL makes the stored test stale.
        var version = await admin.VersionAsync(cluster);
        using (var update = await admin.PutAsJsonAsync(
            new Uri(ClusterTestSupport.ClusterPath(cluster), UriKind.Relative),
            ClusterTestSupport.UpdateBody(version, b => b["apiUrl"] = "https://api.moved.example.com:6443"),
            Ct))
        {
            update.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        (await LastTestAsync(admin, cluster, credentialId)).GetProperty("isStale").GetBoolean().ShouldBeTrue();

        // CRED-2: the token is in no response, audit entry, log line or database row.
        TokenLeakScanner.AssertAbsent(
            token,
            resultText,
            await GetBodyAsync(admin, $"/api/admin/clusters/{cluster}/credentials"),
            audit.DetailsJson,
            audit.Summary,
            await TokenLeakScanner.DumpDatabaseAsync(factory.ConnectionString, Ct),
            factory.Logs.AllText);
    }

    [Fact]
    public async Task TestCredential_WithoutCaBundle_FailsReachability_WithUnknownAuthority()
    {
        await using var server = await HealthyServerAsync();
        using var admin = await factory.AdminClientAsync();
        var cluster = await RegisterAsync(admin, server, withCaBundle: false);
        var credentialId = (await AddOkAsync(admin, cluster, Jwt(Subject))).GetProperty("id").GetGuid();

        using var response = await TestCredentialAsync(admin, cluster, credentialId);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var result = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        result.GetProperty("succeeded").GetBoolean().ShouldBeFalse();
        var reachability = result.GetProperty("steps")[0];
        reachability.GetProperty("status").GetString().ShouldBe("failed");
        reachability.GetProperty("failureKind").GetString().ShouldBe("tlsUnknownAuthority");
        reachability.GetProperty("message").GetString().ShouldBe("Certificate signed by unknown authority — add the cluster CA bundle");
        result.GetProperty("steps").EnumerateArray().Skip(1).ShouldAllBe(s => s.GetProperty("status").GetString() == "skipped");

        var lastTest = await LastTestAsync(admin, cluster, credentialId);
        lastTest.GetProperty("succeeded").GetBoolean().ShouldBeFalse();
        lastTest.GetProperty("failedStep").GetString().ShouldBe("reachability");
        lastTest.GetProperty("headline").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Fact]
    public async Task TestCredential_RejectedToken_FailsAuthentication_AndSkipsTheRest()
    {
        await using var server = await HealthyServerAsync();
        server.Respond("POST", FakeKubeApiServer.SelfSubjectReviewsPath, 401);
        using var admin = await factory.AdminClientAsync();
        var cluster = await RegisterAsync(admin, server);
        var credentialId = (await AddOkAsync(admin, cluster, Jwt(Subject))).GetProperty("id").GetGuid();

        using var response = await TestCredentialAsync(admin, cluster, credentialId);

        var result = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        var authentication = result.GetProperty("steps")[1];
        authentication.GetProperty("status").GetString().ShouldBe("failed");
        authentication.GetProperty("failureKind").GetString().ShouldBe("unauthorized");
        authentication.GetProperty("message").GetString().ShouldBe("Token rejected by the cluster (expired, revoked, or for another cluster)");
        result.GetProperty("steps").EnumerateArray().Skip(2).ShouldAllBe(s => s.GetProperty("status").GetString() == "skipped");
        (await LastTestAsync(admin, cluster, credentialId)).GetProperty("failedStep").GetString().ShouldBe("authentication");
    }

    [Fact]
    public async Task TestCredential_OnDisabledCluster_Runs()
    {
        await using var server = await HealthyServerAsync();
        using var admin = await factory.AdminClientAsync();
        var cluster = await RegisterAsync(admin, server);
        var credentialId = (await AddOkAsync(admin, cluster, Jwt(Subject))).GetProperty("id").GetGuid();
        using (var disable = await admin.PostAsJsonAsync(
            new Uri($"{ClusterTestSupport.ClusterPath(cluster)}/disable", UriKind.Relative), new { version = await admin.VersionAsync(cluster) }, Ct))
        {
            disable.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        using var response = await TestCredentialAsync(admin, cluster, credentialId);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("succeeded").GetBoolean().ShouldBeTrue();
    }

    [Fact]
    public async Task TestToken_StoresNothingButTheAuditEntry_WithFingerprint()
    {
        await using var server = await HealthyServerAsync();
        using var admin = await factory.AdminClientAsync();
        var cluster = await RegisterAsync(admin, server);
        var clusterVersion = await admin.VersionAsync(cluster);
        var token = Jwt("system:serviceaccount:fleet:unsaved");

        using var response = await TestTokenAsync(admin, cluster, new { token = $"  {token}\n", credentialId = (Guid?)null, inspectNamespace = "" });

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var resultText = await response.Content.ReadAsStringAsync(Ct);
        var result = JsonDocument.Parse(resultText).RootElement;
        result.GetProperty("succeeded").GetBoolean().ShouldBeTrue();
        result.GetProperty("namespaceRules").ValueKind.ShouldBe(JsonValueKind.Null);
        result.GetProperty("hints").GetArrayLength().ShouldBe(0);
        server.Requests.ShouldContain(r => r.Authorization == $"Bearer {token}");

        // TEST-5: no credential, unchanged cluster; only the audit entry.
        (await GetBodyAsync(admin, $"/api/admin/clusters/{cluster}/credentials")).ShouldBe("[]");
        (await admin.VersionAsync(cluster)).ShouldBe(clusterVersion);
        var audit = (await factory.Data.AuditEntriesAsync(cluster)).Where(e => e.Action == "credential.token_tested").ShouldHaveSingleItem();
        audit.ClusterName.ShouldBe(cluster);
        using (var details = JsonDocument.Parse(audit.DetailsJson))
        {
            details.RootElement.GetProperty("succeeded").GetBoolean().ShouldBeTrue();
            details.RootElement.GetProperty("headline").GetString().ShouldBe("clusterWideView");
            details.RootElement.GetProperty("fingerprint").GetString().ShouldBe(TokenFingerprints.Compute(new SensitiveString(token)).Value);
        }

        TokenLeakScanner.AssertAbsent(
            token,
            resultText,
            audit.DetailsJson,
            audit.Summary,
            await TokenLeakScanner.DumpDatabaseAsync(factory.ConnectionString, Ct),
            factory.Logs.AllText);
    }

    [Fact]
    public async Task TestToken_WithCredentialHavingReadWriteGrants_HintsThatItCannotWrite()
    {
        await using var server = await HealthyServerAsync();
        using var admin = await factory.AdminClientAsync();
        var cluster = await RegisterAsync(admin, server);
        var credentialId = (await AddOkAsync(admin, cluster, Jwt(Subject))).GetProperty("id").GetGuid();
        await factory.Data.GrantAsync(await factory.OfflineUserAsync(), cluster, new(credentialId), AccessMode.ReadWrite);

        using var response = await TestTokenAsync(admin, cluster, new { token = Jwt(Subject), credentialId, inspectNamespace = (string?)null });

        var hint = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("hints").EnumerateArray().ShouldHaveSingleItem();
        hint.GetProperty("severity").GetString().ShouldBe("warning");
        hint.GetProperty("message").GetString().ShouldBe("1 user has ReadWrite grants with this credential but it cannot modify workloads");
    }

    [Fact]
    public async Task TestToken_WithCredentialOfAnotherCluster_IsFieldError()
    {
        await using var server = await HealthyServerAsync();
        using var admin = await factory.AdminClientAsync();
        var cluster = await RegisterAsync(admin, server);
        var other = await factory.Data.ClusterAsync();
        var foreign = await factory.Data.CredentialAsync(other.Name);

        using var response = await TestTokenAsync(admin, cluster, new { token = Jwt(Subject), credentialId = foreign.Id.Value, inspectNamespace = (string?)null });

        await response.ShouldBeFieldErrorAsync("credentialId");
        server.Requests.ShouldBeEmpty();
    }

    [Fact]
    public async Task InvalidInput_And_UnknownRouteIds()
    {
        using var admin = await factory.AdminClientAsync();
        var cluster = await factory.Data.ClusterAsync();
        var credential = await factory.Data.CredentialAsync(cluster.Name);

        using (var badNamespace = await TestCredentialAsync(admin, cluster.Name, credential.Id.Value, "Not_A_Namespace"))
        {
            await badNamespace.ShouldBeFieldErrorAsync("inspectNamespace");
        }

        using (var badToken = await TestTokenAsync(admin, cluster.Name, new { token = "has space", credentialId = (Guid?)null, inspectNamespace = (string?)null }))
        {
            await badToken.ShouldBeFieldErrorAsync("token");
        }

        using (var unknownCluster = await TestTokenAsync(admin, "no-such-cluster", new { token = "fake-token", credentialId = (Guid?)null, inspectNamespace = (string?)null }))
        {
            await unknownCluster.ShouldBeProblemAsync(HttpStatusCode.NotFound, "Clusters.NotFound");
        }

        using (var unknownCredential = await TestCredentialAsync(admin, cluster.Name, Guid.NewGuid()))
        {
            await unknownCredential.ShouldBeProblemAsync(HttpStatusCode.NotFound, "Credentials.NotFound");
        }
    }

    [Fact]
    public async Task ReadOnlyAdmin_IsForbidden()
    {
        using var readOnly = await factory.ReadOnlyAdminClientAsync();
        var cluster = await factory.Data.ClusterAsync();
        var credential = await factory.Data.CredentialAsync(cluster.Name);

        using (var test = await TestCredentialAsync(readOnly, cluster.Name, credential.Id.Value))
        {
            await test.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "Auth.ReadOnly");
        }

        using var testToken = await TestTokenAsync(readOnly, cluster.Name, new { token = "fake-token", credentialId = (Guid?)null, inspectNamespace = (string?)null });
        await testToken.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "Auth.ReadOnly");
    }

    // A healthy OpenShift API server where the token has cluster-wide view: list pods, deployments and namespaces.
    private static async Task<FakeKubeApiServer> HealthyServerAsync()
    {
        var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion();
        server.MapSelfSubjectReview(Subject, "system:authenticated");
        server.MapClusterVersion();
        server.MapRulesReview(false, null, (["get", "list"], [""], ["pods"], []));
        server.SetAccessReview("list", "", "pods", allowed: true);
        server.SetAccessReview("list", "apps", "deployments", allowed: true);
        server.SetAccessReview("list", "", "namespaces", allowed: true);
        return server;
    }

    private static async Task<string> RegisterAsync(HttpClient admin, FakeKubeApiServer server, bool withCaBundle = true)
    {
        var name = $"ct-{TestData.Unique()}";
        using var response = await admin.PostAsJsonAsync(
            new Uri(ClusterTestSupport.ClustersPath, UriKind.Relative),
            ClusterTestSupport.RegisterBody(name, body =>
            {
                body["apiUrl"] = server.BaseAddress.GetLeftPart(UriPartial.Authority);
                body["caBundle"] = withCaBundle ? server.CaBundlePem : null;
            }),
            Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        return name;
    }

    private static Task<HttpResponseMessage> TestCredentialAsync(HttpClient client, string cluster, Guid credentialId, string? inspectNamespace = null) =>
        client.PostAsJsonAsync(ClusterCredentials(cluster, $"/{credentialId}/test"), new { inspectNamespace }, Ct);

    private static Task<HttpResponseMessage> TestTokenAsync(HttpClient client, string cluster, object body) =>
        client.PostAsJsonAsync(new Uri($"/api/admin/clusters/{cluster}/test-token", UriKind.Relative), body, Ct);

    private static async Task<JsonElement> LastTestAsync(HttpClient admin, string cluster, Guid credentialId)
    {
        using var list = JsonDocument.Parse(await GetBodyAsync(admin, $"/api/admin/clusters/{cluster}/credentials"));
        return Find(list.RootElement, credentialId).ShouldNotBeNull().GetProperty("lastTest").Clone();
    }
}
