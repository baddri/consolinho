using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using static FleetConsole.Api.Tests.Integration.Admin.Clusters.ClusterTestSupport;

namespace FleetConsole.Api.Tests.Integration.Admin.Clusters;

/// <summary>
/// <c>POST /api/admin/clusters</c> (CLU-1/2/3): 201 with the detail and Location, every validation rule of contract
/// §8.2 as a field error under its JSON key, 409 for a taken name, and 403 for read-only admins (ADM-2).
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class RegisterClusterTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Register_Returns201WithDetailAndLocation_AndAudits()
    {
        var admin = await factory.AdminClientAsync();
        var name = $"new-{TestData.Unique()}";

        using var response = await admin.PostAsJsonAsync(ClustersPath, RegisterBody(name, b =>
        {
            b["displayName"] = "  Production East  ";
            b["apiUrl"] = "https://api.east.example.com:6443/";
            b["environment"] = "production";
            b["webConsoleUrl"] = "https://console-openshift-console.apps.east.example.com";
            b["description"] = " Main cluster ";
            b["isEnabled"] = false;
        }), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        response.Headers.Location!.OriginalString.ShouldBe($"/api/admin/clusters/{name}");
        var body = await response.JsonAsync();
        body.GetProperty("name").GetString().ShouldBe(name);
        body.GetProperty("displayName").GetString().ShouldBe("Production East");
        body.GetProperty("apiUrl").GetString().ShouldBe("https://api.east.example.com:6443");
        body.GetProperty("environment").GetString().ShouldBe("production");
        body.GetProperty("webConsoleUrl").GetString().ShouldBe("https://console-openshift-console.apps.east.example.com");
        body.GetProperty("description").GetString().ShouldBe("Main cluster");
        body.GetProperty("isEnabled").GetBoolean().ShouldBeFalse();
        body.GetProperty("tlsMode").GetString().ShouldBe("systemTrust");
        body.GetProperty("credentialCount").GetInt32().ShouldBe(0);
        body.GetProperty("version").GetUInt32().ShouldBe(await admin.VersionAsync(name));

        var audit = await factory.Data.AuditEntriesAsync(name);
        audit.ShouldContain(e => e.Action == "cluster.registered");
    }

    [Fact]
    public async Task Register_WithoutIsEnabled_DefaultsToEnabled_AndBlankDisplayNameIsName()
    {
        var admin = await factory.AdminClientAsync();
        var name = $"new-{TestData.Unique()}";

        using var response = await admin.PostAsJsonAsync(ClustersPath, RegisterBody(name, b => b["displayName"] = "   "), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        var body = await response.JsonAsync();
        body.GetProperty("isEnabled").GetBoolean().ShouldBeTrue();
        body.GetProperty("displayName").GetString().ShouldBe(name);
    }

    [Fact]
    public async Task Register_SkipTlsVerify_HasSkipVerifyMode()
    {
        var admin = await factory.AdminClientAsync();
        var name = $"new-{TestData.Unique()}";

        using var response = await admin.PostAsJsonAsync(ClustersPath, RegisterBody(name, b => b["skipTlsVerify"] = true), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        (await response.JsonAsync()).GetProperty("tlsMode").GetString().ShouldBe("skipVerify");
    }

    [Fact]
    public async Task Register_TakenName_Returns409()
    {
        var admin = await factory.AdminClientAsync();
        var existing = await factory.Data.ClusterAsync();

        using var response = await admin.PostAsJsonAsync(ClustersPath, RegisterBody(existing.Name), Ct);

        await response.ShouldBeProblemAsync(HttpStatusCode.Conflict, "Clusters.NameTaken");
    }

    public static TheoryData<string, string, object?> InvalidFields => new()
    {
        { "name", "name", "" },
        { "name", "name", "Upper-Case" },
        { "name", "name", "-leading-dash" },
        { "name", "name", "trailing-dash-" },
        { "name", "name", "under_score" },
        { "name", "name", new string('a', 41) },
        { "displayName", "displayName", new string('d', 101) },
        { "apiUrl", "apiUrl", "" },
        { "apiUrl", "apiUrl", "http://api.example.com:6443" },
        { "apiUrl", "apiUrl", "https://api.example.com:6443/some/path" },
        { "apiUrl", "apiUrl", "https://api.example.com:6443?x=1" },
        { "apiUrl", "apiUrl", "https://api.example.com:6443#frag" },
        { "apiUrl", "apiUrl", "https://user:pw@api.example.com:6443" },
        { "apiUrl", "apiUrl", "api.example.com:6443" },
        { "apiUrl", "apiUrl", "https://" + new string('a', 2048) + ".example.com" },
        { "webConsoleUrl", "webConsoleUrl", "http://console.example.com" },
        { "webConsoleUrl", "webConsoleUrl", "not a url" },
        { "webConsoleUrl", "webConsoleUrl", "https://console.example.com/" + new string('p', 2048) },
        { "description", "description", new string('x', 1001) },
        { "caBundle", "caBundle", "not a pem" },
        { "caBundle", "caBundle", "-----BEGIN CERTIFICATE-----\nbm90IGEgY2VydGlmaWNhdGU=\n-----END CERTIFICATE-----" },
        { "caBundle", "caBundle", new string('a', (256 * 1024) + 1) },
    };

    [Theory]
    [MemberData(nameof(InvalidFields))]
    public async Task Register_InvalidField_Returns400WithFieldError(string field, string expectedKey, object? value)
    {
        var admin = await factory.AdminClientAsync();
        var name = $"new-{TestData.Unique()}";

        using var response = await admin.PostAsJsonAsync(ClustersPath, RegisterBody(name, b => b[field] = value), Ct);

        await response.ShouldBeFieldErrorAsync(expectedKey);
    }

    [Fact]
    public async Task Register_CaBundleWithPrivateKey_Returns400OnCaBundle()
    {
        var admin = await factory.AdminClientAsync();
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var keyPem = key.ExportPkcs8PrivateKeyPem();
        var bundle = CaPem("Leaky CA", DateTimeOffset.UtcNow.AddYears(1)) + "\n" + keyPem;

        using var response = await admin.PostAsJsonAsync(
            ClustersPath, RegisterBody($"new-{TestData.Unique()}", b => b["caBundle"] = bundle), Ct);

        await response.ShouldBeFieldErrorAsync("caBundle");
        // The key material is never echoed back (ProblemDetails carry messages, not input).
        (await response.Content.ReadAsStringAsync(Ct)).ShouldNotContain(keyPem.Split('\n')[1]);
    }

    [Fact]
    public async Task Register_SkipTlsVerifyWithCaBundle_Returns400OnSkipTlsVerify()
    {
        var admin = await factory.AdminClientAsync();
        var bundle = CaPem("Some CA", DateTimeOffset.UtcNow.AddYears(1));

        using var response = await admin.PostAsJsonAsync(ClustersPath, RegisterBody($"new-{TestData.Unique()}", b =>
        {
            b["caBundle"] = bundle;
            b["skipTlsVerify"] = true;
        }), Ct);

        await response.ShouldBeFieldErrorAsync("skipTlsVerify");
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Register_MissingOrUnknownEnvironment_Returns400(bool missing)
    {
        var admin = await factory.AdminClientAsync();
        var name = $"new-{TestData.Unique()}";
        var body = RegisterBody(name, b =>
        {
            if (missing)
            {
                b.Remove("environment");
            }
            else
            {
                b["environment"] = "qa";
            }
        });

        using var response = await admin.PostAsJsonAsync(ClustersPath, body, Ct);

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, code: null);
        using var check = await admin.GetAsync(new Uri(ClusterPath(name), UriKind.Relative), Ct);
        check.StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Register_AsReadOnlyAdmin_Returns403()
    {
        var client = await factory.ReadOnlyAdminClientAsync();

        using var response = await client.PostAsJsonAsync(ClustersPath, RegisterBody($"new-{TestData.Unique()}"), Ct);

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "Auth.ReadOnly");
    }

    [Fact]
    public async Task Register_AsNonAdmin_Returns403()
    {
        var client = await factory.LoginAsAsync(factory.NewUsername());

        using var response = await client.PostAsJsonAsync(ClustersPath, RegisterBody($"new-{TestData.Unique()}"), Ct);

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "Auth.Forbidden");
    }
}
