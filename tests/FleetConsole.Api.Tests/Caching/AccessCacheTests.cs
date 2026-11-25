using System.Collections.Concurrent;
using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Api.Tests.Integration;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using FleetConsole.Api.Tests.Integration.Admin.Credentials;
using FleetConsole.Api.Tests.Integration.Admin.Grants;
using FleetConsole.Api.Tests.Integration.Proxy;
using FleetConsole.Api.Tests.Persistence;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Proxy;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Users;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Caching;

/// <summary>
/// CACHE-1/2 end to end on one instance (L1 only, ADR-0040 §4–5): the first proxied request loads the access snapshot,
/// the next issues no access SQL; and every access-relevant change — direct and group grant revoke, a membership
/// change, a credential rotation, a disabled cluster — is visible on the very next request, without waiting for expiry.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class AccessCacheTests(AccessCacheTests.Host fixture) : IClassFixture<AccessCacheTests.Host>
{
    private const string Pods = "/api/v1/namespaces/shop/pods";

    private static readonly string[] TeamA = ["team-a"];

    private readonly ApiFactory _host = fixture.Api;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Second_request_is_served_from_the_cache_without_access_sql()
    {
        await using var server = await StartServerAsync();
        var username = _host.NewUsername();
        var (cluster, _) = await _host.Data.ProxyClusterAsync(server, username, AccessMode.ReadOnly);
        using var client = await ProxyTestClient.LoginAsync(_host, username);

        fixture.Commands.Clear();
        (await StatusAsync(client, cluster.Name)).ShouldBe(HttpStatusCode.OK);
        AccessQueries().Count.ShouldBe(1, "the miss loads the snapshot in one statement");

        fixture.Commands.Clear();
        (await StatusAsync(client, cluster.Name)).ShouldBe(HttpStatusCode.OK);
        AccessQueries().ShouldBeEmpty(string.Join("\n---\n", fixture.Commands));
    }

    [Fact]
    public async Task Revoked_direct_grant_is_refused_on_the_next_request()
    {
        await using var server = await StartServerAsync();
        var username = _host.NewUsername();
        var (cluster, _) = await _host.Data.ProxyClusterAsync(server, username, AccessMode.ReadOnly);
        using var client = await WarmAsync(username, cluster.Name);
        using var admin = await _host.AdminClientAsync();
        var grant = (await GrantsApi.UserGrantsAsync(admin, username)).Single(g => g.GetProperty("clusterName").GetString() == cluster.Name);

        using (var revoke = await GrantsApi.RevokeAsync(admin, grant.GetProperty("id").GetGuid()))
        {
            revoke.IsSuccessStatusCode.ShouldBeTrue();
        }

        await ShouldBeNotAvailableAsync(client, cluster.Name);
    }

    [Fact]
    public async Task Revoked_group_grant_is_refused_on_the_next_request()
    {
        await using var server = await StartServerAsync();
        var (username, cluster, grantId) = await GroupMemberAsync(server);
        using var client = await WarmAsync(username, cluster, groups: [GroupOf(username)]);

        using (var admin = await _host.AdminClientAsync())
        using (var revoke = await GrantsApi.RevokeAsync(admin, grantId))
        {
            revoke.IsSuccessStatusCode.ShouldBeTrue();
        }

        await ShouldBeNotAvailableAsync(client, cluster);
    }

    [Fact]
    public async Task Leaving_the_group_is_refused_on_the_next_request()
    {
        await using var server = await StartServerAsync();
        var (username, cluster, _) = await GroupMemberAsync(server);
        using var client = await WarmAsync(username, cluster, groups: [GroupOf(username)]);

        await SetGroupsAsync(username, []); // UserGroupsChanged, as a revalidation records it

        await ShouldBeNotAvailableAsync(client, cluster);
    }

    [Fact]
    public async Task New_group_grant_reaches_a_member_whose_snapshot_has_no_row_for_it()
    {
        await using var server = await StartServerAsync();
        var username = _host.NewUsername();
        var group = GroupOf(username);
        var cluster = await _host.Data.ClusterAsync(apiUrl: server.BaseAddress.ToString(), caBundlePem: server.CaBundlePem);
        var credential = await _host.Data.CredentialAsync(cluster.Name);
        using var client = await ProxyTestClient.LoginAsync(_host, username);
        await SetGroupsAsync(username, [group]);
        await ShouldBeNotAvailableAsync(client, cluster.Name); // caches an empty snapshot tagged group:{group}

        using (var admin = await _host.AdminClientAsync())
        using (var create = await GrantsApi.CreateGroupAsync(admin, group, cluster.Name, credential.Id.Value, priority: 10))
        {
            create.StatusCode.ShouldBe(HttpStatusCode.Created);
        }

        (await StatusAsync(client, cluster.Name)).ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Rotated_credential_token_is_used_on_the_next_request()
    {
        await using var server = await StartServerAsync();
        var username = _host.NewUsername();
        await _host.Data.UserAsync(username);
        var cluster = await _host.Data.ClusterAsync(apiUrl: server.BaseAddress.ToString(), caBundlePem: server.CaBundlePem);
        using var admin = await _host.AdminClientAsync();
        var original = CredentialApi.Opaque();
        var credential = await CredentialApi.AddOkAsync(admin, cluster.Name, original);
        var credentialId = credential.GetProperty("id").GetGuid();
        using (var grant = await GrantsApi.CreateAsync(admin, username, cluster.Name, credentialId))
        {
            grant.StatusCode.ShouldBe(HttpStatusCode.Created);
        }

        using var client = await WarmAsync(username, cluster.Name);
        server.Requests[^1].Authorization.ShouldBe($"Bearer {original}");

        var rotated = CredentialApi.Opaque();
        using (var rotate = await CredentialApi.RotateAsync(admin, cluster.Name, credentialId, rotated, credential.GetProperty("version").GetUInt32()))
        {
            rotate.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        (await StatusAsync(client, cluster.Name)).ShouldBe(HttpStatusCode.OK);
        server.Requests[^1].Authorization.ShouldBe($"Bearer {rotated}");
    }

    [Fact]
    public async Task Retested_credentials_inspect_namespaces_are_listed_on_the_next_request()
    {
        // NSA-2: a connection test saves new inspect namespaces; the cached snapshot must not keep serving the old list.
        await using var server = await StartServerAsync();
        var username = _host.NewUsername();
        await _host.Data.UserAsync(username);
        var cluster = await _host.Data.ClusterAsync(apiUrl: server.BaseAddress.ToString(), caBundlePem: server.CaBundlePem);
        using var admin = await _host.AdminClientAsync();
        var credentialId = (await CredentialApi.AddOkAsync(admin, cluster.Name, CredentialApi.Opaque())).GetProperty("id").GetGuid();
        using (var grant = await GrantsApi.CreateAsync(admin, username, cluster.Name, credentialId))
        {
            grant.StatusCode.ShouldBe(HttpStatusCode.Created);
        }

        using var client = await _host.LoginAsAsync(username);
        (await FallbackNamespacesAsync(client)).ShouldBeEmpty();

        // The outcome does not matter: every test run saves the namespaces it inspected (NST-5).
        using (var test = await admin.PostAsJsonAsync(
            CredentialApi.ClusterCredentials(cluster.Name, $"/{credentialId}/test"), new { inspectNamespaces = TeamA }, Ct))
        {
            test.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        (await FallbackNamespacesAsync(client)).ShouldBe(["team-a"]);
    }

    [Fact]
    public async Task Disabled_cluster_is_refused_on_the_next_request()
    {
        await using var server = await StartServerAsync();
        var username = _host.NewUsername();
        var (cluster, _) = await _host.Data.ProxyClusterAsync(server, username, AccessMode.ReadOnly);
        using var client = await WarmAsync(username, cluster.Name);

        using var admin = await _host.AdminClientAsync();
        var version = await admin.VersionAsync(cluster.Name);
        using (var disable = await admin.PostAsJsonAsync($"{ClusterTestSupport.ClusterPath(cluster.Name)}/disable", new { version }, Ct))
        {
            disable.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        await ShouldBeNotAvailableAsync(client, cluster.Name);
    }

    private static string GroupOf(string username) => "grp-" + username;

    // The fallbackNamespaces of the caller's single accessible cluster, from GET /api/clusters.
    private static async Task<List<string?>> FallbackNamespacesAsync(HttpClient client)
    {
        using var response = await client.GetAsync(new Uri("/api/clusters", UriKind.Relative), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var cluster = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).EnumerateArray().ShouldHaveSingleItem();
        return [.. cluster.GetProperty("fallbackNamespaces").EnumerateArray().Select(e => e.GetString())];
    }

    // A user in a fresh group with a ReadOnly group grant on a cluster at server; returns the grant id.
    private async Task<(string Username, string Cluster, Guid GrantId)> GroupMemberAsync(FakeKubeApiServer server)
    {
        var username = _host.NewUsername();
        var cluster = await _host.Data.ClusterAsync(apiUrl: server.BaseAddress.ToString(), caBundlePem: server.CaBundlePem);
        var credential = await _host.Data.CredentialAsync(cluster.Name);
        using var admin = await _host.AdminClientAsync();
        using var create = await GrantsApi.CreateGroupAsync(admin, GroupOf(username), cluster.Name, credential.Id.Value, priority: 10);
        create.StatusCode.ShouldBe(HttpStatusCode.Created);
        var body = await create.Content.ReadFromJsonAsync<JsonElement>(Ct);
        return (username, cluster.Name, body.GetProperty("id").GetGuid());
    }

    // Signs in (recording groups if given) and proxies once, so the snapshot is cached.
    private async Task<ProxyTestClient> WarmAsync(string username, string cluster, IReadOnlyList<string>? groups = null)
    {
        var client = await ProxyTestClient.LoginAsync(_host, username);
        if (groups is not null)
        {
            await SetGroupsAsync(username, groups);
        }

        (await StatusAsync(client, cluster)).ShouldBe(HttpStatusCode.OK);
        return client;
    }

    // Stores the user's groups as a login or revalidation records them (PREC-1); the emulator reports none.
    private async Task SetGroupsAsync(string username, IReadOnlyList<string> groups)
    {
        await using var scope = _host.Services.CreateSignedInScope(TestData.Actor);
        var user = await scope.ServiceProvider.GetRequiredService<IUserRepository>().GetByUsernameAsync(Username.Create(username).Value, Ct);
        user!.ReplaceGroups(groups);
        await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
    }

    private List<string> AccessQueries() =>
        fixture.Commands.Where(sql => sql.Contains("FROM users", StringComparison.Ordinal)
            && sql.Contains("grants", StringComparison.Ordinal)).ToList();

    private static async Task<HttpStatusCode> StatusAsync(ProxyTestClient client, string cluster)
    {
        using var response = await client.SendAsync(HttpMethod.Get, cluster, Pods);
        return response.StatusCode;
    }

    private static async Task ShouldBeNotAvailableAsync(ProxyTestClient client, string cluster)
    {
        using var response = await client.SendAsync(HttpMethod.Get, cluster, Pods);
        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(response, HttpStatusCode.NotFound, ProxyErrors.NotAvailable(cluster));
    }

    private static async Task<FakeKubeApiServer> StartServerAsync()
    {
        var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", Pods, 200, new { kind = "PodList", items = Array.Empty<object>() });
        return server;
    }

    /// <summary>The variant shared by the class, recording every SQL command the Api sends.</summary>
    /// <param name="factory">The collection's default host, which creates the variant.</param>
    public sealed class Host(ApiFactory factory) : IAsyncLifetime
    {
        private readonly CommandRecorder _recorder = new();

        /// <summary>The variant.</summary>
        public ApiFactory Api { get; private set; } = null!;

        /// <summary>Command texts since the last <c>Clear</c>.</summary>
        public ConcurrentQueue<string> Commands => _recorder.Commands;

        /// <inheritdoc />
        public async ValueTask InitializeAsync() =>
            Api = await factory.CreateVariantAsync(
                new Dictionary<string, string?>(),
                configureServices: services =>
                    services.ConfigureDbContext<ConsoleDbContext>(options => options.AddInterceptors(_recorder)));

        /// <inheritdoc />
        public async ValueTask DisposeAsync() => await Api.DisposeAsync();
    }

    private sealed class CommandRecorder : DbCommandInterceptor
    {
        public ConcurrentQueue<string> Commands { get; } = new();

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            Commands.Enqueue(command.CommandText);
            return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
        }
    }
}
