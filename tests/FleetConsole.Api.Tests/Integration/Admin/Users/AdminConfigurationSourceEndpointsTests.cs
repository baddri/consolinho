using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Domain.Audit;
using static FleetConsole.Api.Tests.Integration.Admin.Users.UsersApi;
using static FleetConsole.Api.Tests.Integration.AuthEndpointsTests;

namespace FleetConsole.Api.Tests.Integration.Admin.Users;

/// <summary>
/// POL-4: <c>adminConfigurationSource</c> is a structured object (<c>{ kind, group }</c> or null) on the current user,
/// the user list and the user detail, while the audit <c>configurationSource</c> keeps its text form. Runs on a variant
/// host with <c>Auth:BootstrapAdminUsers = [bob]</c> so all three cases (user list, group, none) exist side by side.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class AdminConfigurationSourceEndpointsTests(ApiFactory factory)
{
    private const string BootstrapAdmin = "bob"; // a shipped emulator user without groups

    private static readonly Uri UsersUri = new("/api/admin/users", UriKind.Relative);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task CurrentUser_List_And_Detail_ServeTheStructuredSource()
    {
        await using var host = await factory.CreateVariantAsync(
            new Dictionary<string, string?> { ["Auth:BootstrapAdminUsers:0"] = BootstrapAdmin });
        var groupAdmin = host.NewAdminUsername();
        var plainUser = host.NewUsername();

        using var bob = await host.LoginAsAsync(BootstrapAdmin);
        using var group = await host.LoginAsAsync(groupAdmin);
        using var plain = await host.LoginAsAsync(plainUser);

        ShouldBeUserList((await GetMeAsync(bob)).GetProperty("adminConfigurationSource"));
        ShouldBeGroup((await GetMeAsync(group)).GetProperty("adminConfigurationSource"));
        (await GetMeAsync(plain)).GetProperty("adminConfigurationSource").ValueKind.ShouldBe(JsonValueKind.Null);

        using var response = await bob.GetAsync(UsersUri, Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var items = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).EnumerateArray()
            .ToDictionary(i => i.GetProperty("username").GetString()!, i => i.GetProperty("adminConfigurationSource"));
        ShouldBeUserList(items[BootstrapAdmin]);
        ShouldBeGroup(items[groupAdmin]);
        items[plainUser].ValueKind.ShouldBe(JsonValueKind.Null);

        ShouldBeUserList((await GetUserAsync(bob, BootstrapAdmin)).GetProperty("adminConfigurationSource"));
        ShouldBeGroup((await GetUserAsync(bob, groupAdmin)).GetProperty("adminConfigurationSource"));
        (await GetUserAsync(bob, plainUser)).GetProperty("adminConfigurationSource").ValueKind.ShouldBe(JsonValueKind.Null);

        // The audit contract keeps the text form, so entries written before and after POL-4 read alike.
        ConfigurationSourceOfPromotion(await host.Data.AuditEntriesAsync(BootstrapAdmin)).ShouldBe("user list");
        ConfigurationSourceOfPromotion(await host.Data.AuditEntriesAsync(groupAdmin)).ShouldBe($"group {TestOAuthServer.AdminGroup}");
    }

    private static void ShouldBeUserList(JsonElement source)
    {
        source.GetProperty("kind").GetString().ShouldBe("userList");
        source.GetProperty("group").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    private static void ShouldBeGroup(JsonElement source)
    {
        source.GetProperty("kind").GetString().ShouldBe("group");
        source.GetProperty("group").GetString().ShouldBe(TestOAuthServer.AdminGroup);
    }

    private static string? ConfigurationSourceOfPromotion(IReadOnlyList<AuditEntry> entries) =>
        JsonSerializer.Deserialize<JsonElement>(entries.Single(e => e.Action == "user.promoted").DetailsJson)
            .GetProperty("configurationSource").GetString();
}
