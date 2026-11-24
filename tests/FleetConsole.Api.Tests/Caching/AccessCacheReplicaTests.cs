using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Api.Tests.Integration;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using FleetConsole.Api.Tests.Integration.Admin.Grants;
using FleetConsole.Api.Tests.Integration.Admin.Users;
using FleetConsole.Api.Tests.Integration.Proxy;
using FleetConsole.Api.Tests.Persistence;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Caching;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Proxy;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.DependencyInjection;
using StackExchange.Redis;

namespace FleetConsole.Api.Tests.Caching;

/// <summary>
/// QG-4 with two replicas: hosts A and B share one database and one Redis (L2 + backplane, ADR-0040 §4–7), each with
/// its own L1 and a 60 s entry duration, so the TTL can never explain a refusal. CACHE-3: an access change committed on
/// A — direct grant revoke, group grant revoke, user set read-only — is refused on B within 2 s. CACHE-6: after both
/// replicas cached a snapshot, no Redis value holds the plaintext SA token in any encoding.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class AccessCacheReplicaTests(AccessCacheReplicaTests.Replicas fixture) : IClassFixture<AccessCacheReplicaTests.Replicas>
{
    private const string Pods = "/api/v1/namespaces/shop/pods";

    /// <summary>Upper bound for the backplane to reach B (CACHE-3: "without waiting for TTL", TTL here is 60 s).</summary>
    private static readonly TimeSpan PropagationBound = TimeSpan.FromSeconds(2);

    private readonly ApiFactory _a = fixture.A;
    private readonly ApiFactory _b = fixture.B;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Direct_grant_revoked_on_A_is_refused_on_B_without_waiting_for_TTL()
    {
        await using var server = await StartServerAsync();
        var username = _a.NewUsername();
        var (cluster, _) = await _a.Data.ProxyClusterAsync(server, username, AccessMode.ReadOnly);
        using var onB = await ProxyTestClient.LoginAsync(_b, username);
        (await StatusAsync(onB, HttpMethod.Get, cluster.Name)).ShouldBe(HttpStatusCode.OK); // B's L1 holds the snapshot
        (await StatusAsync(onB, HttpMethod.Get, cluster.Name)).ShouldBe(HttpStatusCode.OK);

        using var admin = await _a.AdminClientAsync();
        var grant = (await GrantsApi.UserGrantsAsync(admin, username)).Single();
        using (var revoke = await GrantsApi.RevokeAsync(admin, grant.GetProperty("id").GetGuid()))
        {
            revoke.IsSuccessStatusCode.ShouldBeTrue();
        }

        var status = await PollUntilAsync(onB, HttpMethod.Get, cluster.Name, HttpStatusCode.NotFound);
        status.ShouldBe(HttpStatusCode.NotFound, "B still served the revoked grant from its cache");
        await ShouldBeNotAvailableAsync(onB, cluster.Name);
    }

    [Fact]
    public async Task Group_grant_revoked_on_A_is_refused_on_B_without_waiting_for_TTL()
    {
        await using var server = await StartServerAsync();
        var username = _a.NewUsername();
        var group = "grp-" + username;
        var cluster = await _a.Data.ClusterAsync(apiUrl: server.BaseAddress.ToString(), caBundlePem: server.CaBundlePem);
        var credential = await _a.Data.CredentialAsync(cluster.Name);
        using var admin = await _a.AdminClientAsync();
        Guid grantId;
        using (var create = await GrantsApi.CreateGroupAsync(admin, group, cluster.Name, credential.Id.Value, priority: 10))
        {
            create.StatusCode.ShouldBe(HttpStatusCode.Created);
            grantId = (await create.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("id").GetGuid();
        }

        using var onB = await ProxyTestClient.LoginAsync(_b, username);
        await SetGroupsAsync(username, [group]); // committed on A, as a revalidation there would record it
        (await PollUntilAsync(onB, HttpMethod.Get, cluster.Name, HttpStatusCode.OK)).ShouldBe(HttpStatusCode.OK);
        (await StatusAsync(onB, HttpMethod.Get, cluster.Name)).ShouldBe(HttpStatusCode.OK);

        using (var revoke = await GrantsApi.RevokeAsync(admin, grantId))
        {
            revoke.IsSuccessStatusCode.ShouldBeTrue();
        }

        (await PollUntilAsync(onB, HttpMethod.Get, cluster.Name, HttpStatusCode.NotFound))
            .ShouldBe(HttpStatusCode.NotFound, "B still served the revoked group grant from its cache");
    }

    [Fact]
    public async Task User_set_read_only_on_A_has_mutations_refused_on_B_without_waiting_for_TTL()
    {
        await using var server = await StartServerAsync();
        var username = _a.NewUsername();
        var (cluster, _) = await _a.Data.ProxyClusterAsync(server, username, AccessMode.ReadWrite);
        using var onB = await ProxyTestClient.LoginAsync(_b, username);
        (await StatusAsync(onB, HttpMethod.Get, cluster.Name)).ShouldBe(HttpStatusCode.OK);
        (await StatusAsync(onB, HttpMethod.Post, cluster.Name)).ShouldBe(HttpStatusCode.Created);

        using var admin = await _a.AdminClientAsync();
        using (var readOnly = await UsersApi.SetReadOnlyAsync(admin, username, isReadOnly: true))
        {
            readOnly.StatusCode.ShouldBe(HttpStatusCode.OK, await readOnly.Content.ReadAsStringAsync(Ct));
        }

        (await PollUntilAsync(onB, HttpMethod.Post, cluster.Name, HttpStatusCode.Forbidden))
            .ShouldBe(HttpStatusCode.Forbidden, "B still allowed a mutation for a read-only user");
        using var refused = await SendAsync(onB, HttpMethod.Post, cluster.Name);
        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(refused, HttpStatusCode.Forbidden, ProxyErrors.UserReadOnly);
        (await StatusAsync(onB, HttpMethod.Get, cluster.Name)).ShouldBe(HttpStatusCode.OK, "read-only narrows, reads still work");
    }

    [Fact]
    public async Task Redis_never_holds_the_decrypted_SA_token()
    {
        await using var server = await StartServerAsync();
        var username = _a.NewUsername();
        var token = $"sha256~qa-cache6-{Guid.NewGuid():N}{Guid.NewGuid():N}";
        var (cluster, _) = await _a.Data.ProxyClusterAsync(server, username, AccessMode.ReadWrite, token);
        var userId = (await _a.Data.FindUserAsync(username)).ShouldNotBeNull().Id.Value;

        // Warm both replicas: A loads from the database and writes L2, B reads L2 (or loads after A's login event).
        using var onA = await ProxyTestClient.LoginAsync(_a, username);
        using var onB = await ProxyTestClient.LoginAsync(_b, username);
        (await StatusAsync(onA, HttpMethod.Get, cluster.Name)).ShouldBe(HttpStatusCode.OK);
        (await StatusAsync(onB, HttpMethod.Get, cluster.Name)).ShouldBe(HttpStatusCode.OK);
        server.Requests[^1].Authorization.ShouldBe($"Bearer {token}", "the proxy did use the fixture token");
        var accessTokens = _a.HostStub.IssuedAccessTokens.Concat(_b.HostStub.IssuedAccessTokens).ToList();

        var dump = await DumpRedisAsync(fixture.RedisConnectionString);

        dump.Keys.ShouldContain(key => key.Contains($"access:v1:user:{userId:D}", StringComparison.Ordinal), "the scan saw the access entry");
        dump.Values.ShouldContain(value => value.Contains(userId.ToString("D"), StringComparison.Ordinal), "a value carries the user id (tags)");
        dump.Values.ShouldContain(value => value.Contains(username, StringComparison.Ordinal), "a value carries the snapshot itself");
        var haystacks = dump.Keys.Concat(dump.Values).ToArray();
        foreach (var needle in EncodingsOf(token))
        {
            TokenLeakScanner.AssertAbsent(needle, haystacks);
        }

        foreach (var accessToken in accessTokens)
        {
            TokenLeakScanner.AssertAbsent(accessToken, haystacks);
        }
    }

    // The token as it would appear if it leaked through System.Text.Json (escaped string, or base64 of a byte[] at any
    // of the three alignments inside a larger buffer); the plain and percent-escaped forms come from TokenLeakScanner.
    private static IEnumerable<string> EncodingsOf(string token)
    {
        yield return token;
        yield return JsonSerializer.Serialize(token)[1..^1];
        var bytes = Encoding.UTF8.GetBytes(token);
        for (var offset = 0; offset < 3; offset++)
        {
            var base64 = Convert.ToBase64String([.. new byte[offset], .. bytes]);
            yield return base64[4..^4]; // the stable core, whatever surrounds the token in the buffer
        }
    }

    // Every key and every value (strings and hash fields, decoded as UTF-8) in the Redis the replicas share.
    private static async Task<(List<string> Keys, List<string> Values)> DumpRedisAsync(string connectionString)
    {
        await using var redis = await ConnectionMultiplexer.ConnectAsync(connectionString);
        var database = redis.GetDatabase();
        var keys = new List<string>();
        var values = new List<string>();
        foreach (var endpoint in redis.GetEndPoints())
        {
            await foreach (var key in redis.GetServer(endpoint).KeysAsync(pattern: "*", pageSize: 500))
            {
                keys.Add(key.ToString());
                var type = await database.KeyTypeAsync(key);
                switch (type)
                {
                    case RedisType.String:
                        values.Add(Utf8(await database.StringGetAsync(key)));
                        break;
                    case RedisType.Hash:
                        values.AddRange((await database.HashGetAllAsync(key)).Select(entry => Utf8(entry.Value)));
                        break;
                    case RedisType.None:
                        break; // expired between SCAN and TYPE
                    default:
                        throw new ShouldAssertException($"Unexpected Redis type {type} for key {key}: extend the scan.");
                }
            }
        }

        keys.ShouldNotBeEmpty();
        return (keys, values);
    }

    private static string Utf8(RedisValue value) => value.IsNull ? string.Empty : Encoding.UTF8.GetString((byte[])value!);

    // Repeats the request until it answers expected or PropagationBound passes; returns the last status.
    private static async Task<HttpStatusCode> PollUntilAsync(ProxyTestClient client, HttpMethod method, string cluster, HttpStatusCode expected)
    {
        var clock = Stopwatch.StartNew();
        var status = await StatusAsync(client, method, cluster);
        while (status != expected && clock.Elapsed < PropagationBound)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(50), Ct);
            status = await StatusAsync(client, method, cluster);
        }

        return status;
    }

    private static async Task<HttpStatusCode> StatusAsync(ProxyTestClient client, HttpMethod method, string cluster)
    {
        using var response = await SendAsync(client, method, cluster);
        return response.StatusCode;
    }

    private static Task<HttpResponseMessage> SendAsync(ProxyTestClient client, HttpMethod method, string cluster) =>
        method == HttpMethod.Post
            ? client.SendAsync(method, cluster, Pods, JsonContent.Create(new { kind = "Pod", metadata = new { name = "p" } }))
            : client.SendAsync(method, cluster, Pods);

    private static async Task ShouldBeNotAvailableAsync(ProxyTestClient client, string cluster)
    {
        using var response = await client.SendAsync(HttpMethod.Get, cluster, Pods);
        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(response, HttpStatusCode.NotFound, ProxyErrors.NotAvailable(cluster));
    }

    // Stores the user's groups through A, as a login or revalidation there records them (PREC-1).
    private async Task SetGroupsAsync(string username, IReadOnlyList<string> groups)
    {
        await using var scope = _a.Services.CreateSignedInScope(TestData.Actor);
        var user = await scope.ServiceProvider.GetRequiredService<IUserRepository>().GetByUsernameAsync(Username.Create(username).Value, Ct);
        user!.ReplaceGroups(groups);
        await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
    }

    private static async Task<FakeKubeApiServer> StartServerAsync()
    {
        var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", Pods, 200, new { kind = "PodList", items = Array.Empty<object>() });
        server.Respond("POST", Pods, 201, new { kind = "Pod", metadata = new { name = "p" } });
        return server;
    }

    /// <summary>
    /// Two replicas over one database and the collection's Redis, 60 s entries. Startup proves B's backplane
    /// subscription is live (a tag removed on A makes B reload), so no test depends on the subscription race.
    /// </summary>
    /// <param name="factory">The collection's default host (owner of the containers).</param>
    public sealed class Replicas(ApiFactory factory) : IAsyncLifetime
    {
        /// <summary>Replica A (admin writes go here).</summary>
        public ApiFactory A { get; private set; } = null!;

        /// <summary>Replica B (the user's requests go here).</summary>
        public ApiFactory B { get; private set; } = null!;

        /// <summary>The shared Redis.</summary>
        public string RedisConnectionString => factory.Redis.ConnectionString;

        /// <inheritdoc />
        public async ValueTask InitializeAsync()
        {
            A = await factory.CreateVariantAsync(new Dictionary<string, string?>
            {
                ["ConnectionStrings:redis"] = factory.Redis.ConnectionString,
                ["Cache:Duration"] = "00:01:00",
            });
            B = await A.CreateSiblingAsync();
            await BackplaneHandshakeAsync();
        }

        /// <inheritdoc />
        public async ValueTask DisposeAsync()
        {
            await B.DisposeAsync();
            await A.DisposeAsync();
        }

        private async Task BackplaneHandshakeAsync()
        {
            var ct = TestContext.Current.CancellationToken;
            var cacheA = A.Services.GetRequiredService<IQueryCache>();
            var cacheB = B.Services.GetRequiredService<IQueryCache>();
            var key = $"qa:handshake:{Guid.NewGuid():N}";
            var tag = $"qa:{Guid.NewGuid():N}";
            var loads = 0;
            Task<int> Load(CancellationToken _) => Task.FromResult(Interlocked.Increment(ref loads));

            var value = await cacheB.GetOrLoadAsync(key, Load, _ => [tag], ct);
            var deadline = Stopwatch.StartNew();
            while (value == 1 && deadline.Elapsed < TimeSpan.FromSeconds(15))
            {
                await cacheA.RemoveByTagsAsync([tag], ct);
                await Task.Delay(TimeSpan.FromMilliseconds(100), ct);
                value = await cacheB.GetOrLoadAsync(key, Load, _ => [tag], ct);
            }

            value.ShouldBeGreaterThan(1, "B's backplane subscription never received A's invalidation");
        }
    }
}
