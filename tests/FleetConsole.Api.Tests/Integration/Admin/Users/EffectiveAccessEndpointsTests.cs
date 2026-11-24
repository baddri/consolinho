using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using FleetConsole.Api.Tests.Persistence;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.DependencyInjection;
using static FleetConsole.Api.Tests.Integration.Admin.Grants.GrantsApi;
using static FleetConsole.Api.Tests.Integration.Admin.Users.UsersApi;

namespace FleetConsole.Api.Tests.Integration.Admin.Users;

/// <summary>
/// <c>GET /api/admin/users/{username}/effective-access</c> through HTTP (contract CP4.5a §5, EFF-1..5): the admin view
/// agrees with what the user's own switcher (<c>GET /api/clusters</c>) shows (EFF-3), explains the winner, and covers
/// <c>groupsAsOf</c>, no access, 404 and 403. Precedence edge cases (ties) are unit-tested on the handler.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class EffectiveAccessEndpointsTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Matches_the_users_switcher_and_explains_the_winner()
    {
        var username = factory.NewUsername();
        var (g1, g2) = ($"grp-{TestData.Unique()}", $"grp-{TestData.Unique()}");
        using var admin = await factory.AdminClientAsync();

        // C1: direct read-only beats g1 read-write (50) and g2 read-only (10). C2: g1 only. C3: disabled, not listed.
        var c1 = await factory.Data.ClusterAsync();
        var c2 = await factory.Data.ClusterAsync();
        var c3 = await factory.Data.ClusterAsync(isEnabled: false);
        await factory.Data.UserAsync(username);
        var direct = await factory.Data.CredentialAsync(c1.Name);
        await factory.Data.GrantAsync(username, c1.Name, direct.Id, AccessMode.ReadOnly);
        await CreateGroupGrantAsync(admin, g1, c1.Name, 50, "readWrite");
        await CreateGroupGrantAsync(admin, g2, c1.Name, 10, "readOnly");
        await CreateGroupGrantAsync(admin, g1, c2.Name, 20, "readWrite");
        await CreateGroupGrantAsync(admin, g1, c3.Name, 20, "readWrite");

        using var user = await LoginWithGroupsAsync(username, [g1, g2]);
        var switcher = await GetArrayAsync(user, "/api/clusters");

        var body = await OkAsync(await admin.GetAsync(UserUri(username, "/effective-access"), Ct));

        body.GetProperty("username").GetString().ShouldBe(username);
        body.GetProperty("userStatus").GetString().ShouldBe("active");
        body.GetProperty("groups").EnumerateArray().Select(g => g.GetString()).ShouldBe([g1, g2]);
        body.GetProperty("groupsAsOf").ValueKind.ShouldBe(JsonValueKind.String);
        var clusters = body.GetProperty("clusters").EnumerateArray().ToList();
        clusters.Select(c => (c.GetProperty("clusterName").GetString(), c.GetProperty("accessMode").GetString()))
            .ShouldBe(
                switcher.Select(c => (c.GetProperty("name").GetString(), c.GetProperty("accessMode").GetString()))
                    .OrderBy(c => c.Item1, StringComparer.Ordinal),
                "EFF-3: same clusters and modes as the user's switcher");
        clusters.Select(c => c.GetProperty("clusterName").GetString()).ShouldBe(new[] { c1.Name, c2.Name }.Order(StringComparer.Ordinal));

        var first = clusters.Single(c => c.GetProperty("clusterName").GetString() == c1.Name);
        first.GetProperty("accessMode").GetString().ShouldBe("readOnly");
        first.GetProperty("narrowedByReadOnlyFlag").GetBoolean().ShouldBeFalse();
        first.GetProperty("source").GetProperty("kind").GetString().ShouldBe("user");
        first.GetProperty("credentialId").GetGuid().ShouldBe(direct.Id.Value);
        first.GetProperty("credentialName").GetString().ShouldBe(direct.Name);
        first.GetProperty("candidates").EnumerateArray()
            .Select(c => (c.GetProperty("subjectName").GetString(), c.GetProperty("outcome").GetString(), c.GetProperty("beatenBy").GetString()))
            .ShouldBe([(username, "winner", null), (g1, "overriddenByDirectGrant", null), (g2, "overriddenByDirectGrant", null)]);

        var second = clusters.Single(c => c.GetProperty("clusterName").GetString() == c2.Name);
        var source = second.GetProperty("source");
        (source.GetProperty("kind").GetString(), source.GetProperty("groupName").GetString(), source.GetProperty("priority").GetInt32())
            .ShouldBe(("group", g1, 20));
    }

    [Fact]
    public async Task Never_logged_in_user_without_grants_has_no_clusters_and_no_groups_as_of()
    {
        using var admin = await factory.AdminClientAsync();
        var user = await factory.Data.UserAsync();

        var body = await OkAsync(await admin.GetAsync(UserUri(user.Username, "/effective-access"), Ct));

        body.GetProperty("userStatus").GetString().ShouldBe("pending");
        body.GetProperty("groupsAsOf").ValueKind.ShouldBe(JsonValueKind.Null);
        body.GetProperty("clusters").GetArrayLength().ShouldBe(0);
    }

    [Fact]
    public async Task Unknown_user_is_404_and_non_admin_is_403()
    {
        using var admin = await factory.AdminClientAsync();
        await ProblemAsync(
            await admin.GetAsync(UserUri($"nobody-{TestData.Unique()}", "/effective-access"), Ct), HttpStatusCode.NotFound, "Users.NotFound");

        var target = await factory.Data.UserAsync();
        using var nonAdmin = await factory.LoginAsAsync(factory.NewUsername());
        await ProblemAsync(
            await nonAdmin.GetAsync(UserUri(target.Username, "/effective-access"), Ct), HttpStatusCode.Forbidden, "Auth.Forbidden");
    }

    private async Task CreateGroupGrantAsync(HttpClient admin, string group, string clusterName, int priority, string mode)
    {
        var credential = await factory.Data.CredentialAsync(clusterName);
        using var response = await CreateGroupAsync(admin, group, clusterName, credential.Id.Value, priority, mode);
        response.StatusCode.ShouldBe(HttpStatusCode.Created, await response.Content.ReadAsStringAsync(Ct));
    }

    // Signs in, then stores the groups as a login or revalidation would record them (the emulator's users/~ only
    // reports configured groups); same approach as ProxyGroupGrantTests.
    private async Task<HttpClient> LoginWithGroupsAsync(string username, IReadOnlyList<string> groups)
    {
        var client = await factory.LoginAsAsync(username);
        await using var scope = factory.Services.CreateSignedInScope(TestData.Actor);
        var user = await scope.ServiceProvider.GetRequiredService<IUserRepository>().GetByUsernameAsync(Username.Create(username).Value, Ct);
        user!.ReplaceGroups(groups);
        await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
        return client;
    }
}
