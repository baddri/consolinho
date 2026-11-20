using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Api.Tests.Integration.Admin.Credentials;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Users;
using Npgsql;
using static FleetConsole.Api.Tests.Integration.Admin.Audit.AuditApi;
using static FleetConsole.Api.Tests.Integration.Admin.Users.UsersApi;

namespace FleetConsole.Api.Tests.Integration.Admin.Audit;

/// <summary>
/// <c>GET /api/admin/audit</c> through HTTP on the shared host (contract §10, AUD-2/4/5, CRED-2). The database is shared
/// with other tests, so every test seeds entries under unique names and filters by them.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class AuditEndpointsTests(ApiFactory factory)
{
    // Whole seconds in the past: stable under Postgres' microsecond precision and older than anything written "now".
    private static readonly DateTimeOffset T0 =
        DateTimeOffset.FromUnixTimeSeconds(DateTimeOffset.UtcNow.AddDays(-1).ToUnixTimeSeconds());

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string Unique(string prefix) => $"{prefix}-{TestData.Unique()}";

    // ---- AUD-5 -----------------------------------------------------------------------------------------------------

    [Fact]
    public async Task Anonymous_Is401()
    {
        using var client = factory.CreateBrowserClient();

        await ProblemAsync(await client.GetAsync(AuditUri(), Ct), HttpStatusCode.Unauthorized, "Auth.Unauthenticated");
    }

    [Fact]
    public async Task NonAdmin_Is403()
    {
        using var client = await factory.LoginAsAsync(factory.NewUsername());

        await ProblemAsync(await client.GetAsync(AuditUri(), Ct), HttpStatusCode.Forbidden, "Auth.Forbidden");
    }

    [Fact]
    public async Task ReadOnlyAdmin_Is200()
    {
        var admin = await factory.Data.UserAsync(role: UserRole.Admin, isReadOnly: true);
        using var client = await factory.LoginAsAsync(admin.Username);

        await PageAsync(client, ("limit", "1"));
    }

    // ---- AUD-4: order, filters, paging -----------------------------------------------------------------------------

    [Fact]
    public async Task Pages_AreNewestFirst_WithoutDuplicatesOrGaps_WhileNewEntriesArrive()
    {
        var client = await AdminAsync(factory);
        var actor = Unique("pager");
        var seeded = new List<(DateTimeOffset At, Guid Id)>();
        for (var i = 0; i < 8; i++)
        {
            // Pairs share a timestamp, so the id tiebreaker decides the order across page boundaries.
            var at = T0.AddSeconds(i / 2);
            seeded.Add((at, await SeedAsync(factory, at, actor, "auth.login", "session")));
        }

        var expected = seeded.OrderByDescending(s => s.At).ThenByDescending(s => s.Id).Select(s => s.Id).ToArray();
        var seen = new List<Guid>();
        string? cursor = null;
        var pages = 0;
        do
        {
            var page = await PageAsync(client, ("actor", actor), ("limit", "3"), ("cursor", cursor));
            seen.AddRange(Ids(page));
            cursor = page.GetProperty("nextCursor").GetString();
            pages++;

            // New entries between page requests are newer than every cursor and must not shift later pages.
            await SeedAsync(factory, DateTimeOffset.UtcNow, actor, "auth.login", "session");
        }
        while (cursor is not null && pages < 10);

        pages.ShouldBe(3);
        seen.ShouldBe(expected);
    }

    [Fact]
    public async Task Filters_Alone_And_Combined()
    {
        var client = await AdminAsync(factory);
        var actor = Unique("actor");
        var admin = Unique("admin");
        var user = Unique("user");
        var cluster = Unique("c");
        var tag = TestData.Unique();

        var userCreated = await SeedAsync(factory, T0, actor, "user.created", $"Target-{tag}-One", related: user);
        var grantCreated = await SeedAsync(
            factory, T0.AddSeconds(1), admin, "grant.created", $"{user} → {cluster}", cluster, related: user, AuditTargetType.Grant);
        var clusterUpdated = await SeedAsync(
            factory, T0.AddSeconds(2), admin, "cluster.updated", cluster, cluster, targetType: AuditTargetType.Cluster);
        var credentialAdded = await SeedAsync(
            factory, T0.AddSeconds(3), actor, "credential.added", $"sa_%{tag}", cluster, targetType: AuditTargetType.Credential);

        Ids(await PageAsync(client, ("actor", actor))).ShouldBe([credentialAdded, userCreated]);
        // user: as related user (target user, user of a target grant) ...
        Ids(await PageAsync(client, ("user", user))).ShouldBe([grantCreated, userCreated]);
        // ... and as actor.
        Ids(await PageAsync(client, ("user", actor))).ShouldBe([credentialAdded, userCreated]);
        Ids(await PageAsync(client, ("cluster", cluster))).ShouldBe([credentialAdded, clusterUpdated, grantCreated]);
        Ids(await PageAsync(client, ("cluster", cluster), ("category", "clusters"))).ShouldBe([clusterUpdated]);
        // target: case-insensitive substring ...
        Ids(await PageAsync(client, ("target", $"target-{tag.ToUpperInvariant()}"))).ShouldBe([userCreated]);
        // ... where LIKE wildcards match literally ("_%" must not match "-On" etc.).
        Ids(await PageAsync(client, ("target", $"_%{tag}"))).ShouldBe([credentialAdded]);
        Ids(await PageAsync(client, ("target", $"t_rget-{tag}"))).ShouldBeEmpty();
        // Half-open time range: from inclusive, to exclusive.
        Ids(await PageAsync(client, ("cluster", cluster), ("from", Iso(T0.AddSeconds(1))), ("to", Iso(T0.AddSeconds(3)))))
            .ShouldBe([clusterUpdated, grantCreated]);
        // Everything combined.
        Ids(await PageAsync(
                client,
                ("actor", admin),
                ("user", user),
                ("category", "grants"),
                ("cluster", cluster),
                ("target", "→"),
                ("from", Iso(T0)),
                ("to", Iso(T0.AddSeconds(2)))))
            .ShouldBe([grantCreated]);
    }

    // QA (CP2 verify), PAUD-4: proxy entries are a category of their own and the cluster filter applies to them.
    [Fact]
    public async Task Proxy_Category_And_Cluster_Filter_Select_Proxy_Entries()
    {
        var client = await AdminAsync(factory);
        var actor = Unique("actor");
        var cluster = Unique("c");
        var other = Unique("c");

        var update = await SeedAsync(
            factory, T0, actor, "proxy.update", "shop/configmaps/web", cluster, targetType: AuditTargetType.KubernetesResource);
        var delete = await SeedAsync(
            factory, T0.AddSeconds(1), actor, "proxy.delete", "shop/pods/web-1", cluster, targetType: AuditTargetType.KubernetesResource);
        await SeedAsync(
            factory, T0.AddSeconds(2), actor, "proxy.create", "shop/pods", other, targetType: AuditTargetType.KubernetesResource);
        var clusterUpdated = await SeedAsync(
            factory, T0.AddSeconds(3), actor, "cluster.updated", cluster, cluster, targetType: AuditTargetType.Cluster);

        Ids(await PageAsync(client, ("cluster", cluster), ("category", "proxy"))).ShouldBe([delete, update]);
        Ids(await PageAsync(client, ("cluster", cluster))).ShouldBe([clusterUpdated, delete, update]);
        var page = await PageAsync(client, ("cluster", cluster), ("category", "proxy"), ("limit", "1"));
        var item = page.GetProperty("items")[0];
        item.GetProperty("category").GetString().ShouldBe("proxy");
        item.GetProperty("targetType").GetString().ShouldBe("kubernetesResource");
    }

    [Theory]
    [InlineData("limit", "0")]
    [InlineData("limit", "201")]
    [InlineData("cursor", "not-a-cursor")]
    [InlineData("category", "nope")]
    public async Task InvalidParameter_Is400_KeyedByParameter(string name, string value)
    {
        var client = await AdminAsync(factory);

        var body = await ProblemAsync(await client.GetAsync(AuditUri((name, value)), Ct), HttpStatusCode.BadRequest, code: null);

        body.GetProperty("errors").TryGetProperty(name, out _).ShouldBeTrue(body.ToString());
    }

    [Fact]
    public async Task TimeRange_WithNonUtcOffsets_IsNormalized_AndHalfOpen()
    {
        var client = await AdminAsync(factory);
        var cluster = Unique("c");
        var first = await SeedAsync(factory, T0, Unique("a"), "cluster.updated", cluster, cluster);
        var second = await SeedAsync(factory, T0.AddSeconds(1), Unique("a"), "cluster.updated", cluster, cluster);
        await SeedAsync(factory, T0.AddSeconds(2), Unique("a"), "cluster.updated", cluster, cluster);
        var plus2 = TimeSpan.FromHours(2);

        Ids(await PageAsync(
                client, ("cluster", cluster), ("from", Iso(T0.ToOffset(plus2))), ("to", Iso(T0.AddSeconds(2).ToOffset(plus2)))))
            .ShouldBe([second, first]);
    }

    [Fact]
    public async Task TamperedCursor_WithNonUtcOffset_IsNotA500()
    {
        var client = await AdminAsync(factory);
        var cluster = Unique("c");
        var older = await SeedAsync(factory, T0, Unique("a"), "cluster.updated", cluster, cluster);
        var newer = await SeedAsync(factory, T0.AddSeconds(1), Unique("a"), "cluster.updated", cluster, cluster);
        var raw = $"{Iso(T0.AddSeconds(1).ToOffset(TimeSpan.FromHours(5)))}|{newer:D}";
        var cursor = System.Buffers.Text.Base64Url.EncodeToString(System.Text.Encoding.UTF8.GetBytes(raw));

        // The same instant as the newer entry's position, so the page continues with the older one.
        Ids(await PageAsync(client, ("cluster", cluster), ("cursor", cursor))).ShouldBe([older]);
    }

    [Fact]
    public async Task FromNotBeforeTo_Is400_OnTo()
    {
        var client = await AdminAsync(factory);

        var body = await ProblemAsync(
            await client.GetAsync(AuditUri(("from", Iso(T0)), ("to", Iso(T0))), Ct), HttpStatusCode.BadRequest, code: null);

        body.GetProperty("errors").TryGetProperty("to", out _).ShouldBeTrue(body.ToString());
    }

    // ---- AUD-2: entry shape and correlation ------------------------------------------------------------------------

    [Fact]
    public async Task Entry_ExposesAllFields_AndCorrelationIdIsTheWritingRequestsTraceId()
    {
        var client = await AdminAsync(factory);
        var username = $"audit-{TestData.Unique()}";
        var traceId = Guid.NewGuid().ToString("N");
        using var create = new HttpRequestMessage(HttpMethod.Post, "/api/admin/users")
        {
            Content = JsonContent.Create(new { username, role = "user", isReadOnly = true }),
        };
        create.Headers.Add("traceparent", $"00-{traceId}-{traceId[..16]}-01");
        (await client.SendAsync(create, Ct)).StatusCode.ShouldBe(HttpStatusCode.Created);

        var entry = (await PageAsync(client, ("user", username))).GetProperty("items").EnumerateArray().ShouldHaveSingleItem();

        entry.GetProperty("action").GetString().ShouldBe("user.created");
        entry.GetProperty("category").GetString().ShouldBe("users");
        entry.GetProperty("targetType").GetString().ShouldBe("user");
        entry.GetProperty("targetName").GetString().ShouldBe(username);
        entry.GetProperty("actor").GetString().ShouldNotBeNullOrEmpty();
        entry.GetProperty("actorIsSystem").GetBoolean().ShouldBeFalse();
        entry.GetProperty("clusterName").ValueKind.ShouldBe(JsonValueKind.Null);
        entry.GetProperty("summary").GetString().ShouldNotBeNullOrEmpty();
        entry.GetProperty("correlationId").GetString().ShouldBe(traceId);
        var details = entry.GetProperty("details");
        details.ValueKind.ShouldBe(JsonValueKind.Object);
        details.GetProperty("isReadOnly").GetBoolean().ShouldBeTrue();
        entry.GetProperty("occurredAt").GetDateTimeOffset().ShouldBeGreaterThan(DateTimeOffset.UtcNow.AddMinutes(-5));
    }

    // ---- CRED-2 ----------------------------------------------------------------------------------------------------

    [Fact]
    public async Task AuditResponses_NeverContainTokens()
    {
        var client = await AdminAsync(factory);
        var cluster = await factory.Data.ClusterAsync();
        var seeded = await factory.Data.CredentialAsync(cluster.Name);
        var added = CredentialApi.Opaque();
        var rotated = CredentialApi.Opaque();
        var credential = await CredentialApi.AddOkAsync(client, cluster.Name, added);
        using (var rotate = await CredentialApi.RotateAsync(
                   client, cluster.Name, credential.GetProperty("id").GetGuid(), rotated, credential.GetProperty("version").GetUInt32()))
        {
            rotate.StatusCode.ShouldBe(HttpStatusCode.OK, await rotate.Content.ReadAsStringAsync(Ct));
        }

        using var response = await client.GetAsync(AuditUri(("cluster", cluster.Name)), Ct);
        var body = await response.Content.ReadAsStringAsync(Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        body.ShouldContain("credential.rotated");
        foreach (var secret in new[] { seeded.Token, added, rotated })
        {
            TokenLeakScanner.AssertAbsent(secret, body);
        }
    }

    // ---- OpenAPI ---------------------------------------------------------------------------------------------------

    [Fact]
    public async Task OpenApi_PublishesCamelCaseQueryParameters()
    {
        using var client = factory.CreateApiClient();
        var document = await client.GetFromJsonAsync<JsonElement>(new Uri("/openapi/v1.json", UriKind.Relative), Ct);

        var operation = document.GetProperty("paths").GetProperty("/api/admin/audit").GetProperty("get");

        operation.GetProperty("operationId").GetString().ShouldBe("ListAuditEntries");
        operation.GetProperty("parameters").EnumerateArray().Select(p => p.GetProperty("name").GetString())
            .ShouldBe(["actor", "user", "category", "cluster", "target", "from", "to", "cursor", "limit"]);
    }

    // ---- Query plan sanity -----------------------------------------------------------------------------------------

    [Fact]
    public async Task ClusterFilter_CanUseTheClusterNameIndex()
    {
        // Mirrors the SQL ListAuditEntriesHandler emits for ?cluster= (same predicate, ORDER BY and LIMIT limit+1, as seen
        // in the logged command); keep the two in sync if the handler's query shape changes. The table is small in tests, so sequential scans are disabled
        // to ask "is the index usable for this predicate" rather than "is it cheaper on 100 rows".
        await using var connection = new NpgsqlConnection(factory.ConnectionString);
        await connection.OpenAsync(Ct);
        await using (var off = new NpgsqlCommand("ANALYZE audit_entries; SET enable_seqscan = off;", connection))
        {
            await off.ExecuteNonQueryAsync(Ct);
        }

        await using var explain = new NpgsqlCommand(
            "EXPLAIN SELECT * FROM audit_entries WHERE cluster_name = @c ORDER BY occurred_at DESC, id DESC LIMIT 51",
            connection);
        explain.Parameters.AddWithValue("c", "prod-eu-1");
        var plan = new List<string>();
        await using (var reader = await explain.ExecuteReaderAsync(Ct))
        {
            while (await reader.ReadAsync(Ct))
            {
                plan.Add(reader.GetString(0));
            }
        }

        string.Join('\n', plan).ShouldContain("ix_audit_entries_cluster_name");
    }

    private static string Iso(DateTimeOffset value) => value.ToString("O", System.Globalization.CultureInfo.InvariantCulture);
}
