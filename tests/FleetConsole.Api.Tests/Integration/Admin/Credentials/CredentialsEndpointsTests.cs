using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Credentials.Tokens;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using static FleetConsole.Api.Tests.Integration.Admin.Credentials.CredentialApi;

namespace FleetConsole.Api.Tests.Integration.Admin.Credentials;

/// <summary>
/// The credential endpoints through HTTP on the shared host (contract §8.3–§8.4, CRED-1..7): add, token rules, rotate,
/// delete, authorization and the write-only guarantee (CRED-2). Expiry statuses with a fake clock are in
/// <see cref="CredentialExpiryTests"/>.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class CredentialsEndpointsTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Add_Jwt_Returns201_WithMetadataAndLocation()
    {
        var cluster = await factory.Data.ClusterAsync();
        using var admin = await factory.LoginAsAsync(factory.NewAdminUsername());
        var exp = DateTimeOffset.UtcNow.AddDays(200);
        var iat = DateTimeOffset.UtcNow.AddDays(-1);
        var token = Jwt("system:serviceaccount:fleet-ops:viewer", exp, iat);
        var name = NewName();

        using var response = await AddAsync(admin, cluster.Name, name, token, "Fleet view");

        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        var id = body.GetProperty("id").GetGuid();
        response.Headers.Location.ShouldBe(new Uri($"/api/admin/clusters/{cluster.Name}/credentials/{id}", UriKind.Relative));
        body.GetProperty("name").GetString().ShouldBe(name);
        body.GetProperty("clusterName").GetString().ShouldBe(cluster.Name);
        body.GetProperty("description").GetString().ShouldBe("Fleet view");
        body.GetProperty("tokenType").GetString().ShouldBe("jwt");
        body.GetProperty("serviceAccount").GetString().ShouldBe("fleet-ops/viewer");
        body.GetProperty("subject").GetString().ShouldBe("system:serviceaccount:fleet-ops:viewer");
        body.GetProperty("expiresAt").GetDateTimeOffset().ShouldBe(DateTimeOffset.FromUnixTimeSeconds(exp.ToUnixTimeSeconds()));
        body.GetProperty("issuedAt").GetDateTimeOffset().ShouldBe(DateTimeOffset.FromUnixTimeSeconds(iat.ToUnixTimeSeconds()));
        body.GetProperty("expiryStatus").GetString().ShouldBe("ok");
        body.GetProperty("expiryWarningDays").GetInt32().ShouldBe(14);
        body.GetProperty("fingerprint").GetString().ShouldBe(TokenFingerprints.Compute(new SensitiveString(token)).Value);
        body.GetProperty("grantCount").GetInt32().ShouldBe(0);
        body.GetProperty("lastTest").ValueKind.ShouldBe(JsonValueKind.Null);
        body.GetProperty("inspectNamespaces").GetArrayLength().ShouldBe(0);
        body.TryGetProperty("token", out _).ShouldBeFalse();

        var audit = (await factory.Data.AuditEntriesAsync(name)).ShouldHaveSingleItem();
        audit.Action.ShouldBe("credential.added");
        audit.DetailsJson.ShouldNotContain(token);
    }

    [Fact]
    public async Task Add_OpaqueToken_IsAccepted_WithUnknownExpiry()
    {
        var cluster = await factory.Data.ClusterAsync();
        using var admin = await factory.LoginAsAsync(factory.NewAdminUsername());

        var body = await AddOkAsync(admin, cluster.Name, Opaque());

        body.GetProperty("tokenType").GetString().ShouldBe("opaque");
        body.GetProperty("expiryStatus").GetString().ShouldBe("unknown");
        body.GetProperty("serviceAccount").ValueKind.ShouldBe(JsonValueKind.Null);
        body.GetProperty("expiresAt").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Fact]
    public async Task Add_TrimsTheToken_BeforeFingerprinting()
    {
        var cluster = await factory.Data.ClusterAsync();
        using var admin = await factory.LoginAsAsync(factory.NewAdminUsername());
        var token = Opaque();

        var body = await AddOkAsync(admin, cluster.Name, $"  \n{token}\r\n ");

        body.GetProperty("fingerprint").GetString().ShouldBe(TokenFingerprints.Compute(new SensitiveString(token)).Value);
    }

    [Theory]
    [InlineData("", "Token is required.")]
    [InlineData("   \n ", "Token is required.")]
    [InlineData("sha256~fake two-parts", "The token must not contain spaces or line breaks.")]
    [InlineData("sha256~fake\nwrapped", "The token must not contain spaces or line breaks.")]
    [InlineData("TOO_LONG", "The token must be at most 16384 characters long.")]
    public async Task Add_InvalidToken_Is400_OnToken_WithoutEchoingIt(string token, string message)
    {
        if (token == "TOO_LONG")
        {
            token = new string('a', TokenValidationRules.MaxLength + 1);
        }

        var cluster = await factory.Data.ClusterAsync();
        using var admin = await factory.LoginAsAsync(factory.NewAdminUsername());

        using var response = await AddAsync(admin, cluster.Name, NewName(), token);

        var body = await ShouldBeProblemAsync(response, HttpStatusCode.BadRequest, "Validation.Failed");
        body.GetProperty("errors").GetProperty("token")[0].GetString().ShouldBe(message);
        if (token.Trim().Length > 0)
        {
            body.GetRawText().ShouldNotContain(token.Trim());
        }
    }

    [Fact]
    public async Task Add_MissingToken_Is400_TokenRequired()
    {
        var cluster = await factory.Data.ClusterAsync();
        using var admin = await factory.LoginAsAsync(factory.NewAdminUsername());

        using var response = await admin.PostAsJsonAsync(ClusterCredentials(cluster.Name), new { name = NewName() }, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        body.GetProperty("errors").GetProperty("token")[0].GetString().ShouldBe(TokenValidationRules.RequiredMessage);
    }

    [Fact]
    public async Task Add_InvalidNameAndDescription_Are400_OnTheirFields()
    {
        var cluster = await factory.Data.ClusterAsync();
        using var admin = await factory.LoginAsAsync(factory.NewAdminUsername());

        using var response = await AddAsync(admin, cluster.Name, "Not_Valid", Opaque(), new string('d', Credential.MaxDescriptionLength + 1));

        var body = await ShouldBeProblemAsync(response, HttpStatusCode.BadRequest, "Validation.Failed");
        var errors = body.GetProperty("errors");
        errors.TryGetProperty("name", out _).ShouldBeTrue();
        errors.TryGetProperty("description", out _).ShouldBeTrue();
    }

    [Fact]
    public async Task Add_WithInspectNamespaces_SavesThemNormalised_AndAuditsThem()
    {
        var cluster = await factory.Data.ClusterAsync();
        using var admin = await factory.LoginAsAsync(factory.NewAdminUsername());
        var name = NewName();

        using var response = await AddAsync(admin, cluster.Name, name, Opaque(), inspectNamespaces: [" team-a ", "team-a", "team-b"]);

        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        var id = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("id").GetGuid();
        var stored = JsonDocument.Parse(await GetBodyAsync(admin, $"/api/admin/clusters/{cluster.Name}/credentials")).RootElement
            .EnumerateArray().Single(c => c.GetProperty("id").GetGuid() == id);
        Names(stored.GetProperty("inspectNamespaces")).ShouldBe(["team-a", "team-b"]);
        var audit = (await factory.Data.AuditEntriesAsync(name)).ShouldHaveSingleItem();
        Names(JsonDocument.Parse(audit.DetailsJson).RootElement.GetProperty("inspectNamespaces")).ShouldBe(["team-a", "team-b"]);
    }

    [Fact]
    public async Task Add_InvalidInspectNamespaces_Are400_OnTheFieldKey()
    {
        var cluster = await factory.Data.ClusterAsync();
        using var admin = await factory.LoginAsAsync(factory.NewAdminUsername());

        using var invalid = await AddAsync(admin, cluster.Name, NewName(), Opaque(), inspectNamespaces: ["team-a", "Team_A"]);
        using var tooMany = await AddAsync(
            admin, cluster.Name, NewName(), Opaque(), inspectNamespaces: [.. Enumerable.Range(0, 11).Select(i => $"ns-{i}")]);

        var invalidErrors = (await ShouldBeProblemAsync(invalid, HttpStatusCode.BadRequest, "Validation.Failed")).GetProperty("errors");
        invalidErrors.GetProperty("inspectNamespaces[1]")[0].GetString().ShouldStartWith("'Team_A' is not a valid namespace name");
        var tooManyErrors = (await ShouldBeProblemAsync(tooMany, HttpStatusCode.BadRequest, "Validation.Failed")).GetProperty("errors");
        tooManyErrors.GetProperty("inspectNamespaces")[0].GetString().ShouldBe("Enter at most 10 namespaces.");
    }

    [Fact]
    public async Task Add_TakenName_Is409_NameTaken_UnknownCluster_Is404()
    {
        var cluster = await factory.Data.ClusterAsync();
        var existing = await factory.Data.CredentialAsync(cluster.Name);
        using var admin = await factory.LoginAsAsync(factory.NewAdminUsername());

        using var taken = await AddAsync(admin, cluster.Name, existing.Name, Opaque());
        await ShouldBeProblemAsync(taken, HttpStatusCode.Conflict, "Credentials.NameTaken");

        using var unknown = await AddAsync(admin, $"missing-{TestData.Unique()}", NewName(), Opaque());
        await ShouldBeProblemAsync(unknown, HttpStatusCode.NotFound, "Clusters.NotFound");

        using var list = await admin.GetAsync(ClusterCredentials($"missing-{TestData.Unique()}"), Ct);
        await ShouldBeProblemAsync(list, HttpStatusCode.NotFound, "Clusters.NotFound");
    }

    [Fact]
    public async Task Rotate_KeepsIdAndGrants_AndAuditsOldToNewFingerprint()
    {
        var cluster = await factory.Data.ClusterAsync();
        var user = await factory.Data.UserAsync();
        using var admin = await factory.LoginAsAsync(factory.NewAdminUsername());
        var oldToken = Opaque();
        var added = await AddOkAsync(admin, cluster.Name, oldToken);
        var id = added.GetProperty("id").GetGuid();
        var name = added.GetProperty("name").GetString()!;
        await factory.Data.GrantAsync(user.Username, cluster.Name, new CredentialId(id));
        var newToken = Jwt(exp: DateTimeOffset.UtcNow.AddDays(90));

        using var response = await RotateAsync(admin, cluster.Name, id, newToken, added.GetProperty("version").GetUInt32());

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        body.GetProperty("id").GetGuid().ShouldBe(id);
        body.GetProperty("grantCount").GetInt32().ShouldBe(1);
        body.GetProperty("tokenType").GetString().ShouldBe("jwt");
        body.GetProperty("rotatedAt").ValueKind.ShouldNotBe(JsonValueKind.Null);
        body.GetProperty("version").GetUInt32().ShouldNotBe(added.GetProperty("version").GetUInt32());
        var newFingerprint = TokenFingerprints.Compute(new SensitiveString(newToken)).Value;
        body.GetProperty("fingerprint").GetString().ShouldBe(newFingerprint);

        var rotated = (await factory.Data.AuditEntriesAsync(name)).Single(e => e.Action == "credential.rotated");
        using var details = JsonDocument.Parse(rotated.DetailsJson);
        details.RootElement.GetProperty("oldFingerprint").GetString().ShouldBe(added.GetProperty("fingerprint").GetString());
        details.RootElement.GetProperty("newFingerprint").GetString().ShouldBe(newFingerprint);
    }

    [Fact]
    public async Task Rotate_StaleVersion_Is409_OtherClustersCredential_Is404_InvalidToken_Is400()
    {
        var cluster = await factory.Data.ClusterAsync();
        var other = await factory.Data.ClusterAsync();
        var foreign = await factory.Data.CredentialAsync(other.Name);
        using var admin = await factory.LoginAsAsync(factory.NewAdminUsername());
        var added = await AddOkAsync(admin, cluster.Name, Opaque());
        var id = added.GetProperty("id").GetGuid();
        var version = added.GetProperty("version").GetUInt32();

        using var stale = await RotateAsync(admin, cluster.Name, id, Opaque(), version + 7);
        await ShouldBeProblemAsync(stale, HttpStatusCode.Conflict, "Concurrency.Conflict");

        using var crossCluster = await RotateAsync(admin, cluster.Name, foreign.Id.Value, Opaque(), 0);
        await ShouldBeProblemAsync(crossCluster, HttpStatusCode.NotFound, "Credentials.NotFound");

        using var invalid = await RotateAsync(admin, cluster.Name, id, "has space", version);
        await ShouldBeProblemAsync(invalid, HttpStatusCode.BadRequest, "Validation.Failed");
    }

    [Fact]
    public async Task Delete_Unused_Is204_Used_Is409_InUse()
    {
        var cluster = await factory.Data.ClusterAsync();
        var user = await factory.Data.UserAsync();
        var unused = await factory.Data.CredentialAsync(cluster.Name);
        var used = await factory.Data.CredentialAsync(cluster.Name);
        await factory.Data.GrantAsync(user.Username, cluster.Name, used.Id);
        using var admin = await factory.LoginAsAsync(factory.NewAdminUsername());

        using var deleted = await admin.DeleteAsync(ClusterCredentials(cluster.Name, $"/{unused.Id.Value}"), Ct);
        deleted.StatusCode.ShouldBe(HttpStatusCode.NoContent);

        using var inUse = await admin.DeleteAsync(ClusterCredentials(cluster.Name, $"/{used.Id.Value}"), Ct);
        var problem = await ShouldBeProblemAsync(inUse, HttpStatusCode.Conflict, "Credentials.InUse");
        problem.GetProperty("detail").GetString().ShouldBe($"Credential {used.Name} is used by 1 grant. Re-assign or revoke them first.");

        using var again = await admin.DeleteAsync(ClusterCredentials(cluster.Name, $"/{unused.Id.Value}"), Ct);
        await ShouldBeProblemAsync(again, HttpStatusCode.NotFound, "Credentials.NotFound");

        var list = JsonDocument.Parse(await GetBodyAsync(admin, $"/api/admin/clusters/{cluster.Name}/credentials")).RootElement;
        list.EnumerateArray().Select(c => c.GetProperty("name").GetString()).ShouldBe([used.Name]);
        (await factory.Data.AuditEntriesAsync(unused.Name)).ShouldContain(e => e.Action == "credential.deleted");
    }

    [Fact]
    public async Task ClusterList_IsSortedByName()
    {
        var cluster = await factory.Data.ClusterAsync();
        await factory.Data.CredentialAsync(cluster.Name, name: "zz-last");
        await factory.Data.CredentialAsync(cluster.Name, name: "aa-first");
        await factory.Data.CredentialAsync(cluster.Name, name: "mm-middle");
        using var admin = await factory.LoginAsAsync(factory.NewAdminUsername());

        var list = JsonDocument.Parse(await GetBodyAsync(admin, $"/api/admin/clusters/{cluster.Name}/credentials")).RootElement;

        list.EnumerateArray().Select(c => c.GetProperty("name").GetString()).ShouldBe(["aa-first", "mm-middle", "zz-last"]);
    }

    [Fact]
    public async Task FleetList_IsSortedByExpiryAscending_NullsLast()
    {
        var cluster = await factory.Data.ClusterAsync();
        using var admin = await factory.LoginAsAsync(factory.NewAdminUsername());
        var later = await AddOkAsync(admin, cluster.Name, Jwt(exp: DateTimeOffset.UtcNow.AddDays(300)));
        var opaque = await AddOkAsync(admin, cluster.Name, Opaque());
        var sooner = await AddOkAsync(admin, cluster.Name, Jwt(exp: DateTimeOffset.UtcNow.AddDays(30)));
        var noExpiry = await AddOkAsync(admin, cluster.Name, Jwt());

        var list = JsonDocument.Parse(await GetBodyAsync(admin, "/api/admin/credentials")).RootElement;

        // The shared database holds other tests' credentials too: assert the global order and our relative order.
        var expiries = list.EnumerateArray()
            .Select(c => c.GetProperty("expiresAt").ValueKind == JsonValueKind.Null ? (DateTimeOffset?)null : c.GetProperty("expiresAt").GetDateTimeOffset())
            .ToList();
        expiries.ShouldBe(expiries.OrderBy(e => e is null).ThenBy(e => e).ToList());
        var ids = list.EnumerateArray().Select(c => c.GetProperty("id").GetGuid()).ToList();
        ids.IndexOf(Id(sooner)).ShouldBeLessThan(ids.IndexOf(Id(later)));
        ids.IndexOf(Id(later)).ShouldBeLessThan(ids.IndexOf(Id(opaque)));
        ids.IndexOf(Id(later)).ShouldBeLessThan(ids.IndexOf(Id(noExpiry)));
    }

    [Fact]
    public async Task Cred2_TokensNeverLeave_AfterAddAndRotate()
    {
        var cluster = await factory.Data.ClusterAsync();
        using var admin = await factory.LoginAsAsync(factory.NewAdminUsername());
        var firstToken = Jwt(exp: DateTimeOffset.UtcNow.AddDays(60));
        var secondToken = Opaque();

        // With namespaces, so the sweep also covers bodies and audit details that carry them (NST-7).
        using var addResponse = await AddAsync(admin, cluster.Name, NewName(), firstToken, inspectNamespaces: ["team-a"]);
        var addBody = await addResponse.Content.ReadAsStringAsync(Ct);
        var added = JsonDocument.Parse(addBody).RootElement;
        using var rotateResponse = await RotateAsync(
            admin, cluster.Name, added.GetProperty("id").GetGuid(), secondToken, added.GetProperty("version").GetUInt32());
        rotateResponse.StatusCode.ShouldBe(HttpStatusCode.OK);
        var rotateBody = await rotateResponse.Content.ReadAsStringAsync(Ct);
        using var invalid = await AddAsync(admin, cluster.Name, NewName(), secondToken + " tail");
        var invalidBody = await invalid.Content.ReadAsStringAsync(Ct);

        // /clusters and /clusters/{name} are T-0017's endpoints; QA scans them once both tasks are merged.
        var bodies = new[]
        {
            addBody, rotateBody, invalidBody,
            await GetBodyAsync(admin, "/api/admin/credentials"),
            await GetBodyAsync(admin, $"/api/admin/clusters/{cluster.Name}/credentials"),
        };
        var database = await TokenLeakScanner.DumpDatabaseAsync(factory.ConnectionString, Ct);
        foreach (var token in new[] { firstToken, secondToken })
        {
            TokenLeakScanner.AssertAbsent(token, [.. bodies, database, factory.Logs.AllText]);
        }
    }

    [Fact]
    public async Task ReadOnlyAdmin_CanList_ButCommandsAre403_ReadOnly()
    {
        var cluster = await factory.Data.ClusterAsync();
        var credential = await factory.Data.CredentialAsync(cluster.Name);
        var readOnly = await factory.Data.UserAsync(role: UserRole.Admin, isReadOnly: true);
        using var client = await factory.LoginAsAsync(readOnly.Username);

        await GetBodyAsync(client, "/api/admin/credentials");
        await GetBodyAsync(client, $"/api/admin/clusters/{cluster.Name}/credentials");

        using var add = await AddAsync(client, cluster.Name, NewName(), Opaque());
        await ShouldBeProblemAsync(add, HttpStatusCode.Forbidden, "Auth.ReadOnly");
        using var rotate = await RotateAsync(client, cluster.Name, credential.Id.Value, Opaque(), 0);
        await ShouldBeProblemAsync(rotate, HttpStatusCode.Forbidden, "Auth.ReadOnly");
        using var delete = await client.DeleteAsync(ClusterCredentials(cluster.Name, $"/{credential.Id.Value}"), Ct);
        await ShouldBeProblemAsync(delete, HttpStatusCode.Forbidden, "Auth.ReadOnly");
    }

    [Fact]
    public async Task NonAdmin_Is403_Forbidden_Anonymous_Is401()
    {
        var cluster = await factory.Data.ClusterAsync();
        using var user = await factory.LoginAsAsync(factory.NewUsername());

        using var list = await user.GetAsync(new Uri("/api/admin/credentials", UriKind.Relative), Ct);
        await ShouldBeProblemAsync(list, HttpStatusCode.Forbidden, "Auth.Forbidden");
        using var add = await AddAsync(user, cluster.Name, NewName(), Opaque());
        await ShouldBeProblemAsync(add, HttpStatusCode.Forbidden, "Auth.Forbidden");

        using var anonymous = factory.CreateBrowserClient();
        using var anonymousList = await anonymous.GetAsync(new Uri("/api/admin/credentials", UriKind.Relative), Ct);
        await ShouldBeProblemAsync(anonymousList, HttpStatusCode.Unauthorized, "Auth.Unauthenticated");
    }

    private static Guid Id(JsonElement credential) => credential.GetProperty("id").GetGuid();

    private static string?[] Names(JsonElement array) => [.. array.EnumerateArray().Select(e => e.GetString())];
}
