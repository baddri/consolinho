using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Api.Tests.Identity;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using FleetConsole.Api.Tests.Integration.Admin.Credentials;
using FleetConsole.Api.Tests.Integration.Proxy;
using FleetConsole.Application.Proxy;
using Npgsql;
using static FleetConsole.Api.Tests.Integration.Admin.Grants.GrantsApi;
using static FleetConsole.Api.Tests.Integration.Admin.Users.UsersApi;

namespace FleetConsole.Api.Tests.Integration.Security;

/// <summary>
/// CP4.5a security gates through the HTTP surface only (T-0259): QG-3a/GRP-3 (<c>system:*</c> refused at save and
/// worthless as membership), QG-3b/PREC-1 (host group removal and host outage at revalidation), QG-3c/PREC-6 (read-only
/// flag narrows a read-write group grant), PREC-3/4 (which credential's token reaches the cluster), EFF-3 (admin view ==
/// the user's switcher) and token leak checks on the group and effective-access responses.
/// </summary>
/// <remarks>
/// Grants are created with the admin endpoints; membership comes from the emulator's host <c>groups</c> list
/// (<c>DevGroupMembership.SetGroups</c>) and is picked up by session revalidation, exactly as in production. Only setup
/// that the product forbids by design (a stored <c>system:*</c> grant) is written below HTTP, with raw SQL.
/// One variant for the class: <c>Auth:RevalidationInterval=0</c> and a <see cref="ManualClock"/>, so <see cref="Refresh"/>
/// decides when the host group snapshot is re-read.
/// </remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class GroupAccessSecurityTests(ApiFactory factory, GroupAccessSecurityTests.Host fixture)
    : IClassFixture<GroupAccessSecurityTests.Host>
{
    private const string Pods = "/api/v1/namespaces/shop/pods";
    private const string SystemGroupMessage = "System groups can't be granted access.";

    private readonly ApiFactory _host = fixture.Api;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // ---- QG-3a / GRP-3 ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task QG3a_System_groups_are_refused_on_create_and_bulk_and_never_stored()
    {
        var cluster = await _host.Data.ClusterAsync();
        var credential = await _host.Data.CredentialAsync(cluster.Name);
        using var admin = await _host.AdminClientAsync();
        var grantsBefore = await CountGrantsAsync(_host, "TRUE");

        foreach (var name in new[] { "system:authenticated", "SYSTEM:masters", " system:x " })
        {
            using var create = await CreateGroupAsync(admin, name, cluster.Name, credential.Id.Value, priority: 10, "readWrite");
            (await create.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "Validation.Failed"))
                .GetProperty("errors").GetProperty("groupName")[0].GetString().ShouldBe(SystemGroupMessage, name);

            using var bulk = await BulkGroupAsync(admin, name, 11, (cluster.Name, credential.Id.Value));
            (await bulk.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "Validation.Failed")).GetRawText()
                .ShouldContain(SystemGroupMessage, Case.Sensitive, name);
        }

        // A user-grant attempt with a system group as the "username" is never accepted either.
        using var asUser = await CreateAsync(admin, "system:authenticated", cluster.Name, credential.Id.Value, "readWrite");
        asUser.StatusCode.ShouldBeOneOf(HttpStatusCode.BadRequest, HttpStatusCode.NotFound);

        (await CountGrantsAsync(_host, "TRUE")).ShouldBe(grantsBefore);
        (await CountGrantsAsync(_host, "group_name ILIKE '%system:%'")).ShouldBe(0);
    }

    [Fact]
    public async Task QG3a_System_groups_reported_by_the_host_are_not_recorded_listed_or_effective()
    {
        var username = _host.NewUsername();
        var real = NewGroup();
        _host.OAuthServer.GroupMembership.SetGroups(username, ["system:authenticated", "system:masters", real]);
        Refresh();

        using var client = await _host.LoginAsAsync(username);
        (await client.MeStatusAsync()).ShouldBe(HttpStatusCode.OK); // first revalidation records the host groups
        var me = await (await client.GetAsync(new Uri("/api/auth/me", UriKind.Relative), Ct)).JsonAsync();

        me.GetProperty("groups").EnumerateArray().Select(g => g.GetString()).ShouldBe([real]);
        (await _host.Data.FindUserAsync(username)).ShouldNotBeNull().Groups.ShouldBe([real]);
        using var admin = await _host.AdminClientAsync();
        var effective = await OkAsync(await admin.GetAsync(UserUri(username, "/effective-access"), Ct));
        effective.GetProperty("groups").EnumerateArray().Select(g => g.GetString()).ShouldBe([real]);
        effective.GetProperty("clusters").GetArrayLength().ShouldBe(0);
        var groups = await OkAsync(await admin.GetAsync(new Uri("/api/admin/groups", UriKind.Relative), Ct));
        groups.GetProperty("items").EnumerateArray().Select(g => g.GetProperty("name").GetString()!)
            .ShouldNotContain(n => n.StartsWith("system:", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task QG3a_A_stored_system_group_grant_plus_membership_fails_closed()
    {
        // The product refuses to store either half (GroupName, User.ReplaceGroups), so this state needs raw SQL (a
        // legacy/bypassed row). The resolver would ignore system:* (Domain tests), but HTTP never gets that far: the
        // GroupName converter refuses the row and the request ends in a 500 before anything is forwarded — fail-closed.
        // Own throwaway variant (default 60 s revalidation), so the poisoned rows can't break other tests' listings.
        await using var host = await factory.CreateVariantAsync(new Dictionary<string, string?>());
        await using var server = await StartServerAsync();
        var username = host.NewUsername();
        var cluster = await host.Data.ClusterAsync(apiUrl: server.BaseAddress.ToString(), caBundlePem: server.CaBundlePem);
        using var admin = await host.AdminClientAsync();
        var first = await CreateGroupGrantAsync(host, admin, NewGroup(), cluster.Name, 20, "readWrite");
        var second = await CreateGroupGrantAsync(host, admin, NewGroup(), cluster.Name, 10, "readWrite");
        await RenameGroupGrantAsync(host, first.GrantId, "system:authenticated");
        await RenameGroupGrantAsync(host, second.GrantId, "System:Masters");

        using var client = await ProxyTestClient.LoginAsync(host, username);
        await SetStoredGroupsAsync(host, username, ["system:authenticated", "System:Masters"]);

        using var response = await client.SendAsync(HttpMethod.Get, cluster.Name, Pods);
        response.IsSuccessStatusCode.ShouldBeFalse();
        server.Requests.ShouldBeEmpty("never forwarded with the system group's credential");
        using var switcher = await client.Http.GetAsync(new Uri("/api/clusters", UriKind.Relative), Ct);
        using var effective = await admin.GetAsync(UserUri(username, "/effective-access"), Ct);
        foreach (var listing in new[] { switcher, effective })
        {
            var body = await listing.Content.ReadAsStringAsync(Ct);
            (!listing.IsSuccessStatusCode || !body.Contains(cluster.Name, StringComparison.Ordinal)).ShouldBeTrue(body);
        }

        TokenLeakScanner.AssertAbsent(first.Token, await response.Content.ReadAsStringAsync(Ct), host.Logs.AllText);
    }

    // ---- QG-3b / PREC-1 --------------------------------------------------------------------------------------------

    [Fact]
    public async Task QG3b_Removed_from_host_group_loses_the_proxy_and_the_switcher_after_revalidation_only()
    {
        await using var server = await StartServerAsync();
        var username = _host.NewUsername();
        var group = "sre-emea-" + TestData.Unique();
        var cluster = await ProxyClusterAsync(server);
        using var admin = await _host.AdminClientAsync();
        var grant = await CreateGroupGrantAsync(_host, admin, group, cluster.Name, 10, "readWrite");
        _host.OAuthServer.GroupMembership.SetGroups(username, [group]);
        Refresh();

        using var client = await ProxyTestClient.LoginAsync(_host, username);
        (await client.Http.MeStatusAsync()).ShouldBe(HttpStatusCode.OK); // records the group
        using (var granted = await client.SendAsync(HttpMethod.Get, cluster.Name, Pods))
        {
            granted.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        server.Requests[^1].Authorization.ShouldBe("Bearer " + grant.Token);
        (await SwitcherAsync(client.Http))[cluster.Name].ShouldBe("readWrite");

        _host.OAuthServer.GroupMembership.SetGroups(username, []);
        var hostReads = _host.HostStub.GroupsRequests;
        using (var beforeInterval = await client.SendAsync(HttpMethod.Get, cluster.Name, Pods))
        {
            beforeInterval.StatusCode.ShouldBe(HttpStatusCode.OK, "membership changes wait for the next host read");
        }

        _host.HostStub.GroupsRequests.ShouldBe(hostReads, "access decisions never call the host per request");

        Refresh();
        var forwarded = server.Requests.Count;
        using var removed = await client.SendAsync(HttpMethod.Get, cluster.Name, Pods);

        // PREC-1 says "403"; the proxy contract (CP2 §Proxy.NotAvailable) answers 404 for "no grant", by design.
        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(removed, HttpStatusCode.NotFound, ProxyErrors.NotAvailable(cluster.Name));
        server.Requests.Count.ShouldBe(forwarded);
        (await SwitcherAsync(client.Http)).ShouldNotContainKey(cluster.Name);
    }

    [Fact]
    public async Task QG3b_Host_unreachable_signs_out_a_group_member_and_keeps_a_direct_only_user_on_the_proxy()
    {
        await using var server = await StartServerAsync();
        var group = "sre-emea-" + TestData.Unique();
        var cluster = await ProxyClusterAsync(server);
        using var admin = await _host.AdminClientAsync();
        await CreateGroupGrantAsync(_host, admin, group, cluster.Name, 10, "readOnly");
        var member = _host.NewUsername();
        _host.OAuthServer.GroupMembership.SetGroups(member, [group]);
        var direct = await _host.Data.UserAsync(_host.NewUsername());
        var directCredential = await _host.Data.CredentialAsync(cluster.Name);
        await _host.Data.GrantAsync(direct.Username, cluster.Name, directCredential.Id);
        Refresh();
        using var memberClient = await ProxyTestClient.LoginAsync(_host, member);
        using var directClient = await ProxyTestClient.LoginAsync(_host, direct.Username);
        (await memberClient.Http.MeStatusAsync()).ShouldBe(HttpStatusCode.OK); // records the group

        try
        {
            _host.HostStub.Down = true;
            Refresh();

            using var memberResponse = await memberClient.SendAsync(HttpMethod.Get, cluster.Name, Pods);
            memberResponse.StatusCode.ShouldBe(HttpStatusCode.Unauthorized, "stale groups could keep removed access");
            using var directResponse = await directClient.SendAsync(HttpMethod.Get, cluster.Name, Pods);
            directResponse.StatusCode.ShouldBe(HttpStatusCode.OK, "no recorded group carries a grant");
            server.Requests.ShouldHaveSingleItem().Authorization.ShouldBe("Bearer " + directCredential.Token);
        }
        finally
        {
            _host.HostStub.Down = false;
            Refresh();
        }
    }

    // ---- QG-3c / PREC-6 --------------------------------------------------------------------------------------------

    [Fact]
    public async Task QG3c_Read_only_user_in_a_read_write_group_is_refused_mutations_before_forwarding()
    {
        await using var server = await StartServerAsync();
        server.Respond("DELETE", Pods + "/web", 200, new { kind = "Status" });
        var user = await _host.Data.UserAsync(_host.NewUsername(), isReadOnly: true);
        var group = NewGroup();
        var cluster = await ProxyClusterAsync(server);
        using var admin = await _host.AdminClientAsync();
        var grant = await CreateGroupGrantAsync(_host, admin, group, cluster.Name, 10, "readWrite");
        _host.OAuthServer.GroupMembership.SetGroups(user.Username, [group]);
        Refresh();

        using var client = await ProxyTestClient.LoginAsync(_host, user.Username);
        (await client.Http.MeStatusAsync()).ShouldBe(HttpStatusCode.OK);
        using (var read = await client.SendAsync(HttpMethod.Get, cluster.Name, Pods))
        {
            read.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        var forwarded = server.Requests.Count;
        using var mutation = await client.SendAsync(HttpMethod.Delete, cluster.Name, Pods + "/web");

        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(mutation, HttpStatusCode.Forbidden, ProxyErrors.UserReadOnly);
        server.Requests.Count.ShouldBe(forwarded, "refused before forwarding");
        (await SwitcherAsync(client.Http))[cluster.Name].ShouldBe("readOnly");
        var row = await EffectiveRowAsync(admin, user.Username, cluster.Name);
        row.GetProperty("accessMode").GetString().ShouldBe("readOnly");
        row.GetProperty("narrowedByReadOnlyFlag").GetBoolean().ShouldBeTrue();
        row.GetProperty("source").GetProperty("groupName").GetString().ShouldBe(group);
        row.GetProperty("credentialId").GetGuid().ShouldBe(grant.CredentialId);
    }

    // ---- PREC-3 / PREC-4 -------------------------------------------------------------------------------------------

    [Fact]
    public async Task PREC3_4_The_winning_grants_credential_token_is_the_one_that_reaches_the_cluster()
    {
        await using var server = await StartServerAsync();
        server.Respond("DELETE", Pods + "/web", 200, new { kind = "Status" });
        var user = await _host.Data.UserAsync(_host.NewUsername());
        var (high, low) = (NewGroup(), NewGroup());
        var cluster = await ProxyClusterAsync(server);
        using var admin = await _host.AdminClientAsync();
        var highGrant = await CreateGroupGrantAsync(_host, admin, high, cluster.Name, 900, "readWrite");
        var lowGrant = await CreateGroupGrantAsync(_host, admin, low, cluster.Name, 100, "readOnly");
        var directCredential = await _host.Data.CredentialAsync(cluster.Name, token: $"fake-direct-token.{TestData.Unique()}.not-real");
        Guid directId;
        using (var created = await CreateAsync(admin, user.Username, cluster.Name, directCredential.Id.Value, "readOnly"))
        {
            created.StatusCode.ShouldBe(HttpStatusCode.Created, await created.Content.ReadAsStringAsync(Ct));
            directId = (await created.JsonAsync()).GetProperty("id").GetGuid();
        }

        _host.OAuthServer.GroupMembership.SetGroups(user.Username, [low, high]);
        Refresh();
        using var client = await ProxyTestClient.LoginAsync(_host, user.Username);
        (await client.Http.MeStatusAsync()).ShouldBe(HttpStatusCode.OK);

        // PREC-3: the direct read-only grant beats the read-write group grant with the highest priority.
        await ShouldForwardWithAsync(client, cluster.Name, server, directCredential.Token);
        using (var refused = await client.SendAsync(HttpMethod.Delete, cluster.Name, Pods + "/web"))
        {
            await KubernetesProxyForwardingTests.ShouldBeProblemAsync(refused, HttpStatusCode.Forbidden, ProxyErrors.ReadOnlyGrant(cluster.Name));
        }

        await ShouldMatchSwitcherAsync(admin, client, user.Username, cluster.Name, "readOnly", directCredential.Id.Value);

        // PREC-4: without the direct grant, the highest priority group grant supplies credential and mode.
        (await RevokeAsync(admin, directId)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        await ShouldForwardWithAsync(client, cluster.Name, server, highGrant.Token);
        using (var allowed = await client.SendAsync(HttpMethod.Delete, cluster.Name, Pods + "/web"))
        {
            allowed.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        server.Requests[^1].Authorization.ShouldBe("Bearer " + highGrant.Token);
        await ShouldMatchSwitcherAsync(admin, client, user.Username, cluster.Name, "readWrite", highGrant.CredentialId);

        // Lowering the winner's priority below the other group hands the cluster (and its token) to that group.
        using (var lowered = await UpdateWithPriorityAsync(admin, highGrant.GrantId, "readWrite", highGrant.CredentialId, highGrant.Version, 50))
        {
            lowered.StatusCode.ShouldBe(HttpStatusCode.OK, await lowered.Content.ReadAsStringAsync(Ct));
        }

        await ShouldForwardWithAsync(client, cluster.Name, server, lowGrant.Token);
        await ShouldMatchSwitcherAsync(admin, client, user.Username, cluster.Name, "readOnly", lowGrant.CredentialId);
    }

    // ---- PREC-7 ----------------------------------------------------------------------------------------------------

    [Fact]
    public async Task PREC7_Credential_rotation_removal_guard_and_deactivation_apply_to_group_grants_as_to_user_grants()
    {
        await using var server = await StartServerAsync();
        var user = await _host.Data.UserAsync(_host.NewUsername());
        var group = NewGroup();
        var cluster = await ProxyClusterAsync(server);
        using var admin = await _host.AdminClientAsync();
        var (oldToken, newToken) = (CredentialApi.Opaque(), CredentialApi.Opaque());
        var credential = await CredentialApi.AddOkAsync(admin, cluster.Name, oldToken);
        var credentialId = credential.GetProperty("id").GetGuid();
        using (var created = await CreateGroupAsync(admin, group, cluster.Name, credentialId, 10, "readOnly"))
        {
            created.StatusCode.ShouldBe(HttpStatusCode.Created, await created.Content.ReadAsStringAsync(Ct));
        }

        _host.OAuthServer.GroupMembership.SetGroups(user.Username, [group]);
        Refresh();
        using var client = await ProxyTestClient.LoginAsync(_host, user.Username);
        (await client.Http.MeStatusAsync()).ShouldBe(HttpStatusCode.OK);
        await ShouldForwardWithAsync(client, cluster.Name, server, oldToken);

        using (var rotated = await CredentialApi.RotateAsync(admin, cluster.Name, credentialId, newToken, credential.GetProperty("version").GetUInt32()))
        {
            rotated.StatusCode.ShouldBe(HttpStatusCode.OK, await rotated.Content.ReadAsStringAsync(Ct));
        }

        await ShouldForwardWithAsync(client, cluster.Name, server, newToken);
        using (var delete = await admin.DeleteAsync(CredentialApi.ClusterCredentials(cluster.Name, $"/{credentialId}"), Ct))
        {
            await CredentialApi.ShouldBeProblemAsync(delete, HttpStatusCode.Conflict, "Credentials.InUse");
        }

        await _host.Data.DeactivateAsync(user.Username);
        var forwarded = server.Requests.Count;
        using var deactivated = await client.SendAsync(HttpMethod.Get, cluster.Name, Pods);
        deactivated.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        server.Requests.Count.ShouldBe(forwarded);
    }

    // ---- EFF-3 -----------------------------------------------------------------------------------------------------

    [Fact]
    public async Task EFF3_Effective_access_equals_the_switcher_for_every_user_of_a_mixed_fixture()
    {
        // 3 enabled clusters + 1 disabled; 3 groups with grants on every cluster (distinct priorities, mixed modes);
        // users 0..3 = every subset of {g0, g1} plus direct grants on a diagonal; user 4 = all groups, read-only flag.
        string[] modes = ["readOnly", "readWrite"];
        var clusters = new List<SeededCluster>();
        for (var c = 0; c < 4; c++)
        {
            clusters.Add(await _host.Data.ClusterAsync(isEnabled: c < 3));
        }

        var groups = Enumerable.Range(0, 3).Select(_ => NewGroup()).ToArray();
        using var admin = await _host.AdminClientAsync();
        for (var g = 0; g < groups.Length; g++)
        {
            for (var c = 0; c < clusters.Count; c++)
            {
                if ((g + c) % 4 != 3) // leave some holes, so not every group is on every cluster
                {
                    await CreateGroupGrantAsync(_host, admin, groups[g], clusters[c].Name, priority: 100 * (g + 1) + c, modes[(g + c + 1) % 2]);
                }
            }
        }

        var users = new List<string>();
        for (var u = 0; u < 5; u++)
        {
            var username = (await _host.Data.UserAsync(_host.NewUsername(), isReadOnly: u == 4)).Username;
            users.Add(username);
            var membership = u == 4 ? groups : groups.Take(2).Where((_, g) => ((u >> g) & 1) == 1).ToArray();
            _host.OAuthServer.GroupMembership.SetGroups(username, membership);
            for (var c = 0; c < clusters.Count; c++)
            {
                if ((u + c) % 3 == 0) // direct grants on a diagonal, alternating modes
                {
                    var credential = await _host.Data.CredentialAsync(clusters[c].Name);
                    using var created = await CreateAsync(admin, username, clusters[c].Name, credential.Id.Value, modes[(u + c) % 2]);
                    created.StatusCode.ShouldBe(HttpStatusCode.Created, await created.Content.ReadAsStringAsync(Ct));
                }
            }
        }

        Refresh();
        var sources = new HashSet<string>(StringComparer.Ordinal);
        foreach (var username in users)
        {
            using var client = await _host.LoginAsAsync(username);
            (await client.MeStatusAsync()).ShouldBe(HttpStatusCode.OK); // records the host groups
            var switcher = await SwitcherAsync(client);
            var effective = await OkAsync(await admin.GetAsync(UserUri(username, "/effective-access"), Ct));

            var rows = effective.GetProperty("clusters").EnumerateArray().ToList();
            rows.ToDictionary(r => r.GetProperty("clusterName").GetString()!, r => r.GetProperty("accessMode").GetString())
                .ShouldBe(switcher, ignoreOrder: true, $"EFF-3 for {username}");
            rows.ShouldNotContain(r => r.GetProperty("clusterName").GetString() == clusters[3].Name, "disabled cluster");
            foreach (var row in rows)
            {
                sources.Add(row.GetProperty("narrowedByReadOnlyFlag").GetBoolean()
                    ? "narrowed"
                    : row.GetProperty("source").GetProperty("kind").GetString()!);
            }
        }

        sources.ShouldBe(["user", "group", "narrowed"], ignoreOrder: true, "the fixture exercises every kind of winner");
    }

    // ---- Leak checks -----------------------------------------------------------------------------------------------

    [Fact]
    public async Task Group_listings_grants_and_effective_access_never_contain_an_SA_token()
    {
        await using var server = await StartServerAsync();
        var user = await _host.Data.UserAsync(_host.NewUsername());
        var group = NewGroup();
        var cluster = await ProxyClusterAsync(server);
        using var admin = await _host.AdminClientAsync();
        var grant = await CreateGroupGrantAsync(_host, admin, group, cluster.Name, 10, "readWrite");
        _host.OAuthServer.GroupMembership.SetGroups(user.Username, [group]);
        Refresh();
        using var client = await ProxyTestClient.LoginAsync(_host, user.Username);
        (await client.Http.MeStatusAsync()).ShouldBe(HttpStatusCode.OK);
        await ShouldForwardWithAsync(client, cluster.Name, server, grant.Token);

        string[] paths =
        [
            "/api/admin/groups",
            $"/api/admin/groups/{group}",
            $"/api/admin/groups/{group}/grants",
            $"/api/admin/clusters/{cluster.Name}/grants",
            $"/api/admin/users/{user.Username}/effective-access",
        ];
        var bodies = new List<string>();
        foreach (var path in paths)
        {
            using var response = await admin.GetAsync(new Uri(path, UriKind.Relative), Ct);
            response.StatusCode.ShouldBe(HttpStatusCode.OK, path);
            bodies.Add(await response.Content.ReadAsStringAsync(Ct));
        }

        bodies.Add(_host.Logs.AllText);
        TokenLeakScanner.AssertAbsent(grant.Token, [.. bodies]);
    }

    // ---- helpers ---------------------------------------------------------------------------------------------------

    private static string NewGroup() => "grp-" + TestData.Unique();

    /// <summary>Ages the host group snapshot out, so the next revalidation re-reads the emulator's <c>groups</c> list.</summary>
    private void Refresh() => _host.Clock.ShouldNotBeNull().Advance(TimeSpan.FromSeconds(11));

    private static async Task<FakeKubeApiServer> StartServerAsync()
    {
        var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", Pods, 200, new { kind = "PodList", items = Array.Empty<object>() });
        return server;
    }

    private Task<SeededCluster> ProxyClusterAsync(FakeKubeApiServer server) =>
        _host.Data.ClusterAsync(apiUrl: server.BaseAddress.ToString(), caBundlePem: server.CaBundlePem);

    /// <summary>A group grant created through <c>POST /api/admin/groups/{group}/grants</c> with its own fresh credential.</summary>
    private static async Task<CreatedGroupGrant> CreateGroupGrantAsync(
        ApiFactory host, HttpClient admin, string group, string clusterName, int priority, string mode)
    {
        var credential = await host.Data.CredentialAsync(clusterName);
        using var response = await CreateGroupAsync(admin, group, clusterName, credential.Id.Value, priority, mode);
        response.StatusCode.ShouldBe(HttpStatusCode.Created, await response.Content.ReadAsStringAsync(Ct));
        var body = await response.JsonAsync();
        return new CreatedGroupGrant(body.GetProperty("id").GetGuid(), credential.Id.Value, credential.Token, body.GetProperty("version").GetUInt32());
    }

    /// <summary>The user's switcher: cluster name → access mode.</summary>
    private static async Task<Dictionary<string, string?>> SwitcherAsync(HttpClient client) =>
        (await GetArrayAsync(client, "/api/clusters"))
            .ToDictionary(c => c.GetProperty("name").GetString()!, c => c.GetProperty("accessMode").GetString());

    private static async Task<JsonElement> EffectiveRowAsync(HttpClient admin, string username, string clusterName)
    {
        var body = await OkAsync(await admin.GetAsync(UserUri(username, "/effective-access"), Ct));
        return body.GetProperty("clusters").EnumerateArray().Single(c => c.GetProperty("clusterName").GetString() == clusterName);
    }

    private static async Task ShouldForwardWithAsync(ProxyTestClient client, string clusterName, FakeKubeApiServer server, string token)
    {
        using var response = await client.SendAsync(HttpMethod.Get, clusterName, Pods);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        server.Requests[^1].Authorization.ShouldBe("Bearer " + token);
    }

    private static async Task ShouldMatchSwitcherAsync(
        HttpClient admin, ProxyTestClient client, string username, string clusterName, string mode, Guid credentialId)
    {
        (await SwitcherAsync(client.Http))[clusterName].ShouldBe(mode);
        var row = await EffectiveRowAsync(admin, username, clusterName);
        row.GetProperty("accessMode").GetString().ShouldBe(mode);
        row.GetProperty("credentialId").GetGuid().ShouldBe(credentialId);
    }

    private static async Task<long> CountGrantsAsync(ApiFactory host, string where)
    {
        await using var connection = new NpgsqlConnection(host.ConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand($"SELECT count(*) FROM grants WHERE {where}", connection);
        return (long)(await command.ExecuteScalarAsync(Ct))!;
    }

    private static async Task RenameGroupGrantAsync(ApiFactory host, Guid grantId, string groupName)
    {
        await using var connection = new NpgsqlConnection(host.ConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand("UPDATE grants SET group_name = @name WHERE id = @id", connection);
        command.Parameters.AddWithValue("name", groupName);
        command.Parameters.AddWithValue("id", grantId);
        (await command.ExecuteNonQueryAsync(Ct)).ShouldBe(1);
    }

    private static async Task SetStoredGroupsAsync(ApiFactory host, string username, string[] groups)
    {
        await using var connection = new NpgsqlConnection(host.ConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand("UPDATE users SET groups = @groups WHERE username = @username", connection);
        command.Parameters.AddWithValue("groups", groups);
        command.Parameters.AddWithValue("username", username);
        (await command.ExecuteNonQueryAsync(Ct)).ShouldBe(1);
    }

    private sealed record CreatedGroupGrant(Guid GrantId, Guid CredentialId, string Token, uint Version);

    /// <summary>The class's variant: every request revalidates; a manual clock controls host group snapshot age.</summary>
    /// <param name="factory">The collection's default host, which creates the variant.</param>
    public sealed class Host(ApiFactory factory) : IAsyncLifetime
    {
        /// <summary>The variant.</summary>
        public ApiFactory Api { get; private set; } = null!;

        /// <inheritdoc />
        public async ValueTask InitializeAsync() =>
            Api = await factory.CreateVariantAsync(
                new Dictionary<string, string?>
                {
                    ["Auth:RevalidationInterval"] = "00:00:00",
                    ["Auth:HostGroups:MaxSnapshotAge"] = "00:00:10",
                },
                clock: new ManualClock());

        /// <inheritdoc />
        public async ValueTask DisposeAsync() => await Api.DisposeAsync();
    }
}
