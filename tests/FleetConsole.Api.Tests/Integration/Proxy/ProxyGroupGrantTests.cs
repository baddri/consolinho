using System.Collections.Concurrent;
using System.Data.Common;
using System.Net;
using System.Text.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Api.Tests.Persistence;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Proxy;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Users;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Integration.Proxy;

/// <summary>
/// CP4.5 PREC-2..7 end to end: group grants reach the proxy and the switcher (<c>GET /api/clusters</c>) through the
/// shared resolver — a group member signs in and proxies with the winning grant's credential, direct beats group,
/// priority picks the credential, the read-only flag narrows, a disabled cluster stays unavailable — and ADR-0019: one
/// SQL statement per proxy authorization, matching the user's groups with <c>= ANY</c>.
/// </summary>
/// <remarks>
/// One variant for the class, with a command recorder on the <c>ConsoleDbContext</c>. PREC-2 logs in a pool admin, whose
/// configured group the login records; the other tests store the membership after login (as revalidation would).
/// </remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProxyGroupGrantTests(ProxyGroupGrantTests.Host fixture) : IClassFixture<ProxyGroupGrantTests.Host>
{
    private const string Pods = "/api/v1/namespaces/shop/pods";

    private readonly ApiFactory _host = fixture.Api;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Auto_provisioned_group_member_sees_the_cluster_and_proxies_with_the_group_credential()
    {
        await using var server = await StartServerAsync();
        // Pool admins are in TestOAuthServer.AdminGroup in the emulator's user config, so the login records it.
        var username = _host.NewAdminUsername();
        (await _host.Data.FindUserAsync(username)).ShouldBeNull();
        var (cluster, token) = await GroupClusterAsync(server, TestOAuthServer.AdminGroup, AccessMode.ReadWrite, priority: 10);

        using var client = await ProxyTestClient.LoginAsync(_host, username);
        (await _host.Data.FindUserAsync(username))!.Groups.ShouldContain(TestOAuthServer.AdminGroup);

        (await SwitcherModeAsync(client, cluster.Name)).ShouldBe("readWrite");
        using var response = await client.SendAsync(HttpMethod.Get, cluster.Name, Pods);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        server.Requests[^1].Authorization.ShouldBe("Bearer " + token);
    }

    [Fact]
    public async Task Direct_read_only_grant_beats_a_read_write_group_grant()
    {
        await using var server = await StartServerAsync();
        var username = _host.NewUsername();
        var group = NewGroup();
        string[] groups = [group];
        var (cluster, _) = await GroupClusterAsync(server, group, AccessMode.ReadWrite, priority: Grant.MaxPriority);
        await _host.Data.UserAsync(username);
        var direct = await _host.Data.CredentialAsync(cluster.Name);
        await _host.Data.GrantAsync(username, cluster.Name, direct.Id, AccessMode.ReadOnly);

        using var client = await LoginWithGroupsAsync(username, groups);

        (await SwitcherModeAsync(client, cluster.Name)).ShouldBe("readOnly");
        using (var read = await client.SendAsync(HttpMethod.Get, cluster.Name, Pods))
        {
            read.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        server.Requests[^1].Authorization.ShouldBe("Bearer " + direct.Token);
        var forwarded = server.Requests.Count;
        using var mutation = await client.SendAsync(HttpMethod.Delete, cluster.Name, Pods + "/web");
        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(mutation, HttpStatusCode.Forbidden, ProxyErrors.ReadOnlyGrant(cluster.Name));
        server.Requests.Count.ShouldBe(forwarded);
    }

    [Fact]
    public async Task Highest_priority_group_grant_supplies_the_credential_and_mode()
    {
        await using var server = await StartServerAsync();
        var username = _host.NewUsername();
        var (low, high) = (NewGroup(), NewGroup());
        string[] groups = [low, high];
        var (cluster, _) = await GroupClusterAsync(server, low, AccessMode.ReadOnly, priority: 10);
        var highToken = await AddGroupGrantAsync(cluster.Name, high, AccessMode.ReadWrite, priority: 20);

        using var client = await LoginWithGroupsAsync(username, groups);

        (await SwitcherModeAsync(client, cluster.Name)).ShouldBe("readWrite");
        using var response = await client.SendAsync(HttpMethod.Get, cluster.Name, Pods);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        server.Requests[^1].Authorization.ShouldBe("Bearer " + highToken);
    }

    [Fact]
    public async Task Read_only_user_is_narrowed_on_a_read_write_group_grant()
    {
        await using var server = await StartServerAsync();
        var username = _host.NewUsername();
        var group = NewGroup();
        string[] groups = [group];
        await _host.Data.UserAsync(username, isReadOnly: true);
        var (cluster, _) = await GroupClusterAsync(server, group, AccessMode.ReadWrite, priority: 10);

        using var client = await LoginWithGroupsAsync(username, groups);

        (await SwitcherModeAsync(client, cluster.Name)).ShouldBe("readOnly");
        using var mutation = await client.SendAsync(HttpMethod.Delete, cluster.Name, Pods + "/web");
        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(mutation, HttpStatusCode.Forbidden, ProxyErrors.UserReadOnly);
    }

    [Fact]
    public async Task Group_grant_on_a_disabled_cluster_is_not_available_and_not_listed()
    {
        await using var server = await StartServerAsync();
        var username = _host.NewUsername();
        var group = NewGroup();
        string[] groups = [group];
        var (cluster, _) = await GroupClusterAsync(server, group, AccessMode.ReadWrite, priority: 10, isEnabled: false);

        using var client = await LoginWithGroupsAsync(username, groups);

        (await SwitcherModeAsync(client, cluster.Name)).ShouldBeNull();
        using var response = await client.SendAsync(HttpMethod.Get, cluster.Name, Pods);
        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(response, HttpStatusCode.NotFound, ProxyErrors.NotAvailable(cluster.Name));
        server.Requests.ShouldBeEmpty();
    }

    [Fact]
    public async Task Non_member_is_not_available()
    {
        await using var server = await StartServerAsync();
        var username = _host.NewUsername();
        var (cluster, _) = await GroupClusterAsync(server, NewGroup(), AccessMode.ReadWrite, priority: 10);

        using var client = await LoginWithGroupsAsync(username, [NewGroup()]);

        (await SwitcherModeAsync(client, cluster.Name)).ShouldBeNull();
        using var response = await client.SendAsync(HttpMethod.Get, cluster.Name, Pods);
        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(response, HttpStatusCode.NotFound, ProxyErrors.NotAvailable(cluster.Name));
    }

    [Fact]
    public async Task Proxy_authorization_is_one_sql_statement_matching_groups_with_any()
    {
        await using var server = await StartServerAsync();
        var username = _host.NewUsername();
        var group = NewGroup();
        string[] groups = [group];
        var (cluster, _) = await GroupClusterAsync(server, group, AccessMode.ReadWrite, priority: 10);
        using var client = await LoginWithGroupsAsync(username, groups);
        using (var warmUp = await client.SendAsync(HttpMethod.Get, cluster.Name, Pods))
        {
            warmUp.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        fixture.Commands.Clear();
        using var response = await client.SendAsync(HttpMethod.Get, cluster.Name, Pods);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var grantQueries = fixture.Commands.Where(sql => sql.Contains("FROM users", StringComparison.Ordinal)
            && sql.Contains("grants", StringComparison.Ordinal)).ToList();
        grantQueries.Count.ShouldBe(1, string.Join("\n---\n", fixture.Commands));
        grantQueries[0].ShouldContain("= ANY (u.groups)");
    }

    // Signs in, then stores the user's groups as a login or revalidation would record them (PREC-1). The emulator's
    // users/~ only reports configured groups, so the test writes the membership the resolver reads directly.
    private async Task<ProxyTestClient> LoginWithGroupsAsync(string username, IReadOnlyList<string> groups)
    {
        var client = await ProxyTestClient.LoginAsync(_host, username);
        await using var scope = _host.Services.CreateSignedInScope(TestData.Actor);
        var user = await scope.ServiceProvider.GetRequiredService<IUserRepository>().GetByUsernameAsync(Username.Create(username).Value, Ct);
        user!.ReplaceGroups(groups);
        await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
        return client;
    }

    private static string NewGroup() => "grp-" + TestData.Unique();

    private static async Task<FakeKubeApiServer> StartServerAsync()
    {
        var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", Pods, 200, new { kind = "PodList", items = Array.Empty<object>() });
        return server;
    }

    private static async Task<string?> SwitcherModeAsync(ProxyTestClient client, string cluster)
    {
        using var response = await client.Http.GetAsync(new Uri("/api/clusters", UriKind.Relative), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct));
        return body.RootElement.EnumerateArray()
            .Where(c => c.GetProperty("name").GetString() == cluster)
            .Select(c => c.GetProperty("accessMode").GetString())
            .SingleOrDefault();
    }

    // A cluster at server with one group grant (its own credential); returns the cluster and that credential's token.
    private async Task<(SeededCluster Cluster, string Token)> GroupClusterAsync(
        FakeKubeApiServer server, string group, AccessMode mode, int priority, bool isEnabled = true)
    {
        var cluster = await _host.Data.ClusterAsync(isEnabled: isEnabled, apiUrl: server.BaseAddress.ToString(), caBundlePem: server.CaBundlePem);
        return (cluster, await AddGroupGrantAsync(cluster.Name, group, mode, priority));
    }

    // Seeds a group grant below HTTP (the admin endpoints are T-0252's); returns the new credential's token.
    private async Task<string> AddGroupGrantAsync(string clusterName, string group, AccessMode mode, int priority)
    {
        var credential = await _host.Data.CredentialAsync(clusterName);
        await using var scope = _host.Services.CreateSignedInScope(TestData.Actor);
        var services = scope.ServiceProvider;
        var cluster = await services.GetRequiredService<IClusterRepository>().GetByNameAsync(ClusterName.Create(clusterName).Value, Ct);
        var stored = await services.GetRequiredService<ICredentialRepository>().GetByIdAsync(credential.Id, Ct);
        var readModel = services.GetRequiredService<IReadModel>();
        var existing = await readModel.ToListAsync(
            readModel.Grants.Where(g => g.ClusterId == cluster!.Id && g.SubjectKind == GrantSubjectKind.Group), Ct);
        var slots = existing.Select(g => new GroupGrantSlot(g.GroupName!, g.Priority!.Value)).ToList();

        var grant = Grant.CreateForGroup(
            GroupName.Create(group).Value, cluster!, stored!, mode, priority, slots, TestData.Actor, DateTimeOffset.UtcNow);
        grant.IsSuccess.ShouldBeTrue(grant.IsFailure ? grant.Error.Message : null);
        services.GetRequiredService<IGrantRepository>().Add(grant.Value);
        await services.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
        return credential.Token;
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

    /// <summary>Records the text of every reader command (queries) EF executes.</summary>
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
