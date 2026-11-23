using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Domain.Users;
using static FleetConsole.Api.Tests.Integration.Admin.Users.UsersApi;

namespace FleetConsole.Api.Tests.Integration.Admin.Users;

/// <summary>
/// <c>/api/admin/users</c> through HTTP on the shared host (contract §7, USR-1..6, ADM-1/2/4, ADR-0017, AUD-1). The
/// acting admin is usually an admin by assignment created per test, so self-change rules can be exercised; the last-admin
/// rule needs its own database (<see cref="LastAdminTests"/>).
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class UsersAdminEndpointsTests(ApiFactory factory)
{
    private static readonly Uri UsersUri = new("/api/admin/users", UriKind.Relative);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // ---- ADM-1 / ADM-2 ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task Anonymous_Is401()
    {
        using var client = factory.CreateBrowserClient();

        await ProblemAsync(await client.GetAsync(UsersUri, Ct), HttpStatusCode.Unauthorized, "Auth.Unauthenticated");
        await ProblemAsync(
            await client.PostAsJsonAsync(UsersUri, new { username = NewName() }, Ct), HttpStatusCode.Unauthorized, "Auth.Unauthenticated");
    }

    [Fact]
    public async Task NonAdmin_Is403Forbidden()
    {
        using var client = await factory.LoginAsAsync(factory.NewUsername());

        await ProblemAsync(await client.GetAsync(UsersUri, Ct), HttpStatusCode.Forbidden, "Auth.Forbidden");
        await ProblemAsync(
            await client.PostAsJsonAsync(UsersUri, new { username = NewName() }, Ct), HttpStatusCode.Forbidden, "Auth.Forbidden");
    }

    [Fact]
    public async Task ReadOnlyAdmin_CanRead_ButEveryCommandIs403ReadOnly()
    {
        var admin = await factory.Data.UserAsync(role: UserRole.Admin, isReadOnly: true);
        var target = await factory.Data.UserAsync();
        using var client = await factory.LoginAsAsync(admin.Username);

        (await client.GetAsync(UsersUri, Ct)).StatusCode.ShouldBe(HttpStatusCode.OK);
        var version = await VersionAsync(client, target.Username);

        HttpResponseMessage[] commands =
        [
            await client.PostAsJsonAsync(UsersUri, new { username = NewName() }, Ct),
            await client.PutAsJsonAsync(UserUri(target.Username, "/role"), new { role = "admin", version }, Ct),
            await client.PutAsJsonAsync(UserUri(target.Username, "/read-only"), new { isReadOnly = true, version }, Ct),
            await client.PostAsJsonAsync(UserUri(target.Username, "/deactivate"), new { version }, Ct),
            await client.PostAsJsonAsync(UserUri(target.Username, "/reactivate"), new { version }, Ct),
        ];
        foreach (var response in commands)
        {
            await ProblemAsync(response, HttpStatusCode.Forbidden, "Auth.ReadOnly");
        }

        (await factory.Data.AuditEntriesAsync(target.Username)).ShouldAllBe(e => e.Actor.Name == TestData.Actor);
    }

    [Fact]
    public async Task ReadOnlyAdmin_InvalidBody_IsReadOnly_NotValidation()
    {
        // Contract §7 check order (T-0044): the read-only guard runs before field validation.
        var admin = await factory.Data.UserAsync(role: UserRole.Admin, isReadOnly: true);
        using var client = await factory.LoginAsAsync(admin.Username);

        await ProblemAsync(
            await client.PostAsJsonAsync(UsersUri, new { username = "" }, Ct), HttpStatusCode.Forbidden, "Auth.ReadOnly");
    }

    // ---- USR-1 / USR-6: list and detail ----------------------------------------------------------------------------

    [Fact]
    public async Task List_IsSortedOrdinally_WithStatusGrantCountAndVersion()
    {
        var pending = await factory.Data.UserAsync(username: NewName());
        var deactivated = await factory.Data.UserAsync(username: NewName(), deactivated: true);
        var active = await factory.Data.UserAsync();
        using (await factory.LoginAsAsync(active.Username))
        {
        }

        var cluster = await factory.Data.ClusterAsync();
        var credential = await factory.Data.CredentialAsync(cluster.Name);
        await factory.Data.GrantAsync(active.Username, cluster.Name, credential.Id);
        using var client = await LoginAsAdminAsync();

        using var response = await client.GetAsync(UsersUri, Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var items = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).EnumerateArray().ToList();

        var names = items.Select(i => i.GetProperty("username").GetString()!).ToList();
        names.ShouldBe(names.Order(StringComparer.Ordinal).ToList());
        Item(pending.Username).GetProperty("status").GetString().ShouldBe("pending");
        Item(deactivated.Username).GetProperty("status").GetString().ShouldBe("deactivated");
        var activeItem = Item(active.Username);
        activeItem.GetProperty("status").GetString().ShouldBe("active");
        activeItem.GetProperty("grantCount").GetInt32().ShouldBe(1);
        activeItem.GetProperty("role").GetString().ShouldBe("user");
        activeItem.GetProperty("version").GetUInt32().ShouldBeGreaterThan(0u);
        activeItem.GetProperty("lastLoginAt").ValueKind.ShouldBe(JsonValueKind.String);
        activeItem.TryGetProperty("createdBy", out _).ShouldBeFalse();

        JsonElement Item(string username) => items.Single(i => i.GetProperty("username").GetString() == username);
    }

    [Fact]
    public async Task Detail_OfConfigurationAdmin_ShowsSourceAndGroups()
    {
        var configAdmin = factory.NewAdminUsername();
        using (await factory.LoginAsAsync(configAdmin))
        {
        }

        using var client = await LoginAsAdminAsync();
        var user = await GetUserAsync(client, configAdmin);

        user.GetProperty("role").GetString().ShouldBe("admin");
        user.GetProperty("isAdminViaConfiguration").GetBoolean().ShouldBeTrue();
        user.GetProperty("isAdminByAssignment").GetBoolean().ShouldBeFalse();
        user.GetProperty("adminConfigurationSource").GetProperty("kind").GetString().ShouldBe("group");
        user.GetProperty("adminConfigurationSource").GetProperty("group").GetString().ShouldBe(TestOAuthServer.AdminGroup);
        user.GetProperty("groups").EnumerateArray().Select(g => g.GetString()).ShouldContain(TestOAuthServer.AdminGroup);
        user.GetProperty("status").GetString().ShouldBe("active");
        user.GetProperty("createdBy").GetString().ShouldBe(configAdmin); // auto-provisioned
        user.GetProperty("grantCount").GetInt32().ShouldBe(0);
    }

    [Theory]
    [InlineData("nobody-here")]
    [InlineData("system:serviceaccount:none:sa")]
    public async Task Detail_Unknown_Is404(string username)
    {
        using var client = await LoginAsAdminAsync();

        await ProblemAsync(await client.GetAsync(UserUri(username), Ct), HttpStatusCode.NotFound, "Users.NotFound");
        await ProblemAsync(await client.PutAsJsonAsync(UserUri(username, "/role"), new { role = "admin", version = 1 }, Ct),
            HttpStatusCode.NotFound, "Users.NotFound");
    }

    // ---- USR-2: create ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task Create_Is201WithLocation_AuditedOnce_AndATakenNameIs409()
    {
        var (adminName, session) = await LoginAsAssignedAdminAsync();
        using var client = session;
        var username = $"system:serviceaccount:{TestData.Unique()}:sa";

        using (var response = await client.PostAsJsonAsync(UsersUri, new { username, role = "admin", isReadOnly = true }, Ct))
        {
            response.StatusCode.ShouldBe(HttpStatusCode.Created);
            response.Headers.Location!.OriginalString.ShouldBe($"/api/admin/users/{Uri.EscapeDataString(username)}");
            var user = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
            user.GetProperty("username").GetString().ShouldBe(username);
            user.GetProperty("role").GetString().ShouldBe("admin");
            user.GetProperty("isAdminByAssignment").GetBoolean().ShouldBeTrue();
            user.GetProperty("isReadOnly").GetBoolean().ShouldBeTrue();
            user.GetProperty("status").GetString().ShouldBe("pending");
            user.GetProperty("createdBy").GetString().ShouldBe(adminName);
            user.GetProperty("version").GetUInt32().ShouldBeGreaterThan(0u);
        }

        (await GetUserAsync(client, username)).GetProperty("username").GetString().ShouldBe(username);

        await ProblemAsync(await client.PostAsJsonAsync(UsersUri, new { username }, Ct), HttpStatusCode.Conflict, "Users.UsernameTaken");

        var entry = (await factory.Data.AuditEntriesAsync(username)).ShouldHaveSingleItem();
        entry.Action.ShouldBe("user.created");
        entry.Actor.Name.ShouldBe(adminName);
    }

    [Fact]
    public async Task Create_Defaults_ToWritableUser()
    {
        using var client = await LoginAsAdminAsync();
        var username = NewName();

        using var response = await client.PostAsJsonAsync(UsersUri, new { username }, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        var user = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        user.GetProperty("role").GetString().ShouldBe("user");
        user.GetProperty("isReadOnly").GetBoolean().ShouldBeFalse();
    }

    [Theory]
    [InlineData("")]
    [InlineData("a/b")]
    [InlineData("has space")]
    [InlineData("..")]
    public async Task Create_InvalidUsername_Is400OnUsernameField(string username)
    {
        using var client = await LoginAsAdminAsync();

        var problem = await ProblemAsync(
            await client.PostAsJsonAsync(UsersUri, new { username }, Ct), HttpStatusCode.BadRequest, "Validation.Failed");

        problem.GetProperty("errors").GetProperty("username").GetArrayLength().ShouldBe(1);
    }

    // ---- Role (ADM-5, ADR-0017) ------------------------------------------------------------------------------------

    [Fact]
    public async Task PromoteThenDemote_ReturnsFreshVersion_AndAuditsEachChangeOnce()
    {
        var (_, session) = await LoginAsAssignedAdminAsync();
        using var client = session;
        var target = await factory.Data.UserAsync();
        var before = await VersionAsync(client, target.Username);

        var promoted = await OkAsync(await ChangeRoleAsync(client, target.Username, "admin", before));
        promoted.GetProperty("role").GetString().ShouldBe("admin");
        promoted.GetProperty("isAdminByAssignment").GetBoolean().ShouldBeTrue();
        var afterPromote = promoted.GetProperty("version").GetUInt32();
        afterPromote.ShouldNotBe(before);
        (await VersionAsync(client, target.Username)).ShouldBe(afterPromote);

        // Idempotent repeat: 200, no entry (AUD-1).
        await OkAsync(await ChangeRoleAsync(client, target.Username, "admin"));

        var demoted = await OkAsync(await ChangeRoleAsync(client, target.Username, "user"));
        demoted.GetProperty("role").GetString().ShouldBe("user");

        var actions = (await factory.Data.AuditEntriesAsync(target.Username)).Select(e => e.Action).ToList();
        actions.Count(a => a == "user.promoted").ShouldBe(1);
        actions.Count(a => a == "user.demoted").ShouldBe(1);
    }

    [Fact]
    public async Task PromoteConfigurationAdmin_RecordsAssignment_OnceWithSource()
    {
        // ADR-0017: the assignment is recorded so the role survives leaving the group.
        var configAdmin = factory.NewAdminUsername();
        using (await factory.LoginAsAsync(configAdmin))
        {
        }

        using var client = await LoginAsAdminAsync();
        var promoted = await OkAsync(await ChangeRoleAsync(client, configAdmin, "admin"));
        promoted.GetProperty("isAdminByAssignment").GetBoolean().ShouldBeTrue();
        promoted.GetProperty("isAdminViaConfiguration").GetBoolean().ShouldBeTrue();

        await OkAsync(await ChangeRoleAsync(client, configAdmin, "admin"));

        // The first login already recorded a "configuration" promotion (actor system); exactly one manual one follows.
        var manual = (await factory.Data.AuditEntriesAsync(configAdmin))
            .Where(e => e.Action == "user.promoted")
            .Select(e => JsonSerializer.Deserialize<JsonElement>(e.DetailsJson))
            .Where(d => d.GetProperty("source").GetString() == "manual")
            .ShouldHaveSingleItem();
        manual.GetProperty("configurationSource").GetString().ShouldBe($"group {TestOAuthServer.AdminGroup}");
    }

    [Fact]
    public async Task DemoteConfigurationAdmin_Is409AdminViaConfiguration()
    {
        var configAdmin = factory.NewAdminUsername();
        using (await factory.LoginAsAsync(configAdmin))
        {
        }

        using var client = await LoginAsAdminAsync();
        await ProblemAsync(await ChangeRoleAsync(client, configAdmin, "user"), HttpStatusCode.Conflict, "Users.AdminViaConfiguration");
    }

    [Fact]
    public async Task DemoteOrDeactivateSelf_Is409SelfChange()
    {
        var (adminName, session) = await LoginAsAssignedAdminAsync();
        using var client = session;

        await ProblemAsync(await ChangeRoleAsync(client, adminName, "user"), HttpStatusCode.Conflict, "Users.SelfChange");
        await ProblemAsync(await TransitionAsync(client, adminName, "deactivate"), HttpStatusCode.Conflict, "Users.SelfChange");
    }

    [Fact]
    public async Task StaleVersion_Is409ConcurrencyConflict_OnEveryTransition()
    {
        using var client = await LoginAsAdminAsync();
        var target = await factory.Data.UserAsync();
        var stale = await VersionAsync(client, target.Username);
        await factory.Data.SetReadOnlyAsync(target.Username, isReadOnly: true); // someone else changes the user

        HttpResponseMessage[] responses =
        [
            await client.PutAsJsonAsync(UserUri(target.Username, "/role"), new { role = "admin", version = stale }, Ct),
            await client.PutAsJsonAsync(UserUri(target.Username, "/read-only"), new { isReadOnly = false, version = stale }, Ct),
            await client.PostAsJsonAsync(UserUri(target.Username, "/deactivate"), new { version = stale }, Ct),
            await client.PostAsJsonAsync(UserUri(target.Username, "/reactivate"), new { version = stale }, Ct),
        ];
        foreach (var response in responses)
        {
            var problem = await ProblemAsync(response, HttpStatusCode.Conflict, "Concurrency.Conflict");
            problem.GetProperty("detail").GetString().ShouldBe("This user was changed by someone else. Reload and try again.");
        }
    }

    // ---- Read-only, deactivate, reactivate -------------------------------------------------------------------------

    [Fact]
    public async Task SetReadOnly_TogglesFlag_AuditedOncePerChange()
    {
        using var client = await LoginAsAdminAsync();
        var target = await factory.Data.UserAsync();

        (await OkAsync(await SetReadOnlyAsync(client, target.Username, true))).GetProperty("isReadOnly").GetBoolean().ShouldBeTrue();
        await OkAsync(await SetReadOnlyAsync(client, target.Username, true));
        (await OkAsync(await SetReadOnlyAsync(client, target.Username, false))).GetProperty("isReadOnly").GetBoolean().ShouldBeFalse();

        var entries = (await factory.Data.AuditEntriesAsync(target.Username)).Where(e => e.Action == "user.read_only_changed").ToList();
        entries.Count.ShouldBe(2);
    }

    [Fact]
    public async Task DeactivateThenReactivate_KeepsGrants_AuditedOncePerChange()
    {
        using var client = await LoginAsAdminAsync();
        var target = await factory.Data.UserAsync();
        var cluster = await factory.Data.ClusterAsync();
        var credential = await factory.Data.CredentialAsync(cluster.Name);
        await factory.Data.GrantAsync(target.Username, cluster.Name, credential.Id);

        var deactivated = await OkAsync(await TransitionAsync(client, target.Username, "deactivate"));
        deactivated.GetProperty("status").GetString().ShouldBe("deactivated");
        deactivated.GetProperty("grantCount").GetInt32().ShouldBe(1);
        await OkAsync(await TransitionAsync(client, target.Username, "deactivate"));

        var reactivated = await OkAsync(await TransitionAsync(client, target.Username, "reactivate"));
        reactivated.GetProperty("status").GetString().ShouldBe("pending");
        reactivated.GetProperty("grantCount").GetInt32().ShouldBe(1);
        await OkAsync(await TransitionAsync(client, target.Username, "reactivate"));

        var actions = (await factory.Data.AuditEntriesAsync(target.Username)).Select(e => e.Action).ToList();
        actions.Count(a => a == "user.deactivated").ShouldBe(1);
        actions.Count(a => a == "user.reactivated").ShouldBe(1);
    }

    private static string NewName() => $"pre-{TestData.Unique()}";

    // A configuration admin from the pool: writable, and never the target of these tests.
    private Task<HttpClient> LoginAsAdminAsync() => factory.LoginAsAsync(factory.NewAdminUsername());

    // An admin by assignment: can be demoted/deactivated, so self-change rules apply rather than AdminViaConfiguration.
    private async Task<(string Username, HttpClient Client)> LoginAsAssignedAdminAsync()
    {
        var admin = await factory.Data.UserAsync(role: UserRole.Admin);
        return (admin.Username, await factory.LoginAsAsync(admin.Username));
    }
}
