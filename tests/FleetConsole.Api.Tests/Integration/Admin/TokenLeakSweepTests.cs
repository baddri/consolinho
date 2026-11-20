using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using FleetConsole.Api.Tests.Integration.Admin.Grants;
using Microsoft.AspNetCore.Http;
using static FleetConsole.Api.Tests.Integration.Admin.Credentials.CredentialApi;

namespace FleetConsole.Api.Tests.Integration.Admin;

/// <summary>
/// QA sweep (CP1 VERIFY, CRED-2, TEST-5, AUD-2): one cluster goes through add → rotate → grant → stored-credential test
/// → unsaved-token test (valid and invalid) against a <em>hostile</em> fake API server that echoes the bearer token in
/// its error bodies. Afterwards every admin and user GET that can describe that cluster, its credentials, grants, users
/// or audit entries, every command response, the database and the captured logs are scanned for all three tokens.
/// </summary>
/// <remarks>
/// The per-feature tests scan the credential lists and the success paths; this one adds <c>/api/admin/clusters</c>,
/// <c>/api/admin/clusters/{name}</c>, the grant, user and audit reads, <c>/api/clusters</c>, and the failure paths where
/// a raw upstream body could be copied into a step message.
/// </remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class TokenLeakSweepTests(ApiFactory factory)
{
    private const string Subject = "system:serviceaccount:fleet:viewer";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task NoToken_InAnyResponse_AuditEntry_DatabaseRow_OrLogLine()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion();
        // Hostile upstream: SelfSubjectReview fails with a body that contains the caller's Authorization header, and
        // ClusterVersion is forbidden with the same echo. Neither may reach a step message, the stored test or the audit.
        server.Map("POST", FakeKubeApiServer.SelfSubjectReviewsPath, EchoAuthorizationAsync(500));
        server.Map("GET", FakeKubeApiServer.ClusterVersionPath, EchoAuthorizationAsync(403));

        using var admin = await factory.AdminClientAsync();
        var cluster = $"leak-{TestData.Unique()}";
        var bodies = new List<string>();
        using (var register = await admin.PostAsJsonAsync(
                   new Uri(ClusterTestSupport.ClustersPath, UriKind.Relative),
                   ClusterTestSupport.RegisterBody(cluster, b =>
                   {
                       b["apiUrl"] = server.BaseAddress.GetLeftPart(UriPartial.Authority);
                       b["caBundle"] = server.CaBundlePem;
                   }),
                   Ct))
        {
            register.StatusCode.ShouldBe(HttpStatusCode.Created);
        }

        var added = Jwt(Subject, exp: DateTimeOffset.UtcNow.AddDays(30));
        var rotated = Opaque();
        var unsaved = Opaque();

        var credential = await AddOkAsync(admin, cluster, added);
        var credentialId = credential.GetProperty("id").GetGuid();
        using (var rotate = await RotateAsync(admin, cluster, credentialId, rotated, credential.GetProperty("version").GetUInt32()))
        {
            rotate.StatusCode.ShouldBe(HttpStatusCode.OK);
            bodies.Add(await rotate.Content.ReadAsStringAsync(Ct));
        }

        // A grantee who can log in, so /api/clusters is scanned from the user's side too.
        var grantee = factory.NewUsername();
        using var user = await factory.LoginAsAsync(grantee);
        using (var grant = await GrantsApi.CreateAsync(admin, grantee, cluster, credentialId, "readWrite"))
        {
            grant.StatusCode.ShouldBe(HttpStatusCode.Created);
            bodies.Add(await grant.Content.ReadAsStringAsync(Ct));
        }

        using (var test = await admin.PostAsJsonAsync(ClusterCredentials(cluster, $"/{credentialId}/test"), new { inspectNamespace = "team-a" }, Ct))
        {
            test.StatusCode.ShouldBe(HttpStatusCode.OK);
            var text = await test.Content.ReadAsStringAsync(Ct);
            JsonDocument.Parse(text).RootElement.GetProperty("succeeded").GetBoolean().ShouldBeFalse();
            bodies.Add(text);
        }

        server.Requests.ShouldContain(r => r.Authorization == $"Bearer {rotated}", "the echo must actually have carried the token");

        var testTokenUri = new Uri($"/api/admin/clusters/{cluster}/test-token", UriKind.Relative);
        using (var testToken = await admin.PostAsJsonAsync(testTokenUri, new { token = unsaved, credentialId, inspectNamespace = (string?)null }, Ct))
        {
            testToken.StatusCode.ShouldBe(HttpStatusCode.OK);
            bodies.Add(await testToken.Content.ReadAsStringAsync(Ct));
        }

        using (var invalid = await admin.PostAsJsonAsync(testTokenUri, new { token = $"{unsaved} {unsaved}", credentialId = (Guid?)null, inspectNamespace = (string?)null }, Ct))
        {
            invalid.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
            bodies.Add(await invalid.Content.ReadAsStringAsync(Ct));
        }

        foreach (var path in new[]
                 {
                     "/api/admin/clusters",
                     $"/api/admin/clusters/{cluster}",
                     $"/api/admin/clusters/{cluster}/credentials",
                     "/api/admin/credentials",
                     $"/api/admin/clusters/{cluster}/grants",
                     $"/api/admin/users/{grantee}/grants",
                     $"/api/admin/users/{grantee}",
                     "/api/admin/users",
                     $"/api/admin/audit?cluster={cluster}",
                 })
        {
            bodies.Add(await GetBodyAsync(admin, path));
        }

        bodies.Add(await GetBodyAsync(user, "/api/clusters"));

        // The audit entries for both tests exist and carry the fingerprint, never the token (TEST-5, AUD-2).
        // AuditEntriesAsync matches target or actor name: credential.tested targets the credential, token_tested the cluster.
        var audit = (await factory.Data.AuditEntriesAsync(cluster))
            .Concat(await factory.Data.AuditEntriesAsync(credential.GetProperty("name").GetString()!))
            .ToList();
        audit.ShouldContain(e => e.Action == "credential.tested");
        audit.ShouldContain(e => e.Action == "credential.token_tested");

        var database = await TokenLeakScanner.DumpDatabaseAsync(factory.ConnectionString, Ct);
        foreach (var token in new[] { added, rotated, unsaved })
        {
            TokenLeakScanner.AssertAbsent(
                token,
                [.. bodies, .. audit.Select(e => e.DetailsJson), .. audit.Select(e => e.Summary), database, factory.Logs.AllText]);
        }
    }

    private static RequestDelegate EchoAuthorizationAsync(int status) => async context =>
    {
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json";
        var header = context.Request.Headers.Authorization.ToString();
        await context.Response.WriteAsync(
            JsonSerializer.Serialize(new { kind = "Status", status = "Failure", message = $"upstream rejected {header}", reason = header }),
            context.RequestAborted);
    };
}
