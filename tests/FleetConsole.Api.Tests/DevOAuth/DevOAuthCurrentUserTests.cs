using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using static FleetConsole.Api.Tests.DevOAuth.DevOAuthFlow;

namespace FleetConsole.Api.Tests.DevOAuth;

public sealed class DevOAuthCurrentUserTests(DevOAuthFactory factory) : IClassFixture<DevOAuthFactory>
{
    [Theory]
    [InlineData("admin", "Fleet Admin", new[] { "fleetconsole-admins", "system:authenticated", "system:authenticated:oauth" })]
    [InlineData("ines", "Ines Auditor", new[] { "auditors", "system:authenticated", "system:authenticated:oauth" })]
    public async Task UsersTilde_ReturnsConfiguredUser(string userName, string fullName, string[] groups)
    {
        using var client = factory.CreateNonRedirectingClient();
        var accessToken = await GetAccessTokenAsync(client, userName);

        using var response = await GetCurrentUserAsync(client, accessToken);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var user = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        user.GetProperty("metadata").GetProperty("name").GetString().ShouldBe(userName);
        user.GetProperty("fullName").GetString().ShouldBe(fullName);
        user.GetProperty("groups").EnumerateArray().Select(e => e.GetString()).ShouldBe(groups);
    }

    [Fact]
    public async Task UsersTilde_UserWithoutFullNameOrGroups_OmitsFullName_AndReportsOnlyVirtualGroups()
    {
        using var client = factory.CreateNonRedirectingClient();
        var accessToken = await GetAccessTokenAsync(client, "bob");

        using var response = await GetCurrentUserAsync(client, accessToken);

        var user = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        user.GetProperty("metadata").GetProperty("name").GetString().ShouldBe("bob");
        user.TryGetProperty("fullName", out _).ShouldBeFalse();
        user.GetProperty("groups").EnumerateArray().Select(e => e.GetString())
            .ShouldBe(["system:authenticated", "system:authenticated:oauth"]);
    }

    [Fact]
    public async Task UsersTilde_UidIsStableAcrossLogins()
    {
        using var client = factory.CreateNonRedirectingClient();

        var first = await UidAsync(client, await GetAccessTokenAsync(client, "alice"));
        var second = await UidAsync(client, await GetAccessTokenAsync(client, "alice"));
        var other = await UidAsync(client, await GetAccessTokenAsync(client, "bob"));

        second.ShouldBe(first);
        other.ShouldNotBe(first);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("sha256~not-a-real-token")]
    public async Task UsersTilde_MissingOrUnknownBearer_Returns401KubernetesStatus(string? bearer)
    {
        using var client = factory.CreateNonRedirectingClient();

        using var response = await GetCurrentUserAsync(client, bearer);

        await ShouldBeUnauthorizedStatusAsync(response);
    }

    [Fact]
    public async Task UsersTilde_ExpiredToken_Returns401()
    {
        using var client = factory.CreateNonRedirectingClient();
        var accessToken = await GetAccessTokenAsync(client);
        factory.Time.Advance(TimeSpan.FromHours(24));

        using var response = await GetCurrentUserAsync(client, accessToken);

        await ShouldBeUnauthorizedStatusAsync(response);
    }

    private static async Task<string?> UidAsync(HttpClient client, string accessToken)
    {
        using var response = await GetCurrentUserAsync(client, accessToken);
        var user = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        return user.GetProperty("metadata").GetProperty("uid").GetString();
    }

    private static async Task ShouldBeUnauthorizedStatusAsync(HttpResponseMessage response)
    {
        response.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        var status = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        status.GetProperty("kind").GetString().ShouldBe("Status");
        status.GetProperty("apiVersion").GetString().ShouldBe("v1");
        status.GetProperty("status").GetString().ShouldBe("Failure");
        status.GetProperty("reason").GetString().ShouldBe("Unauthorized");
        status.GetProperty("code").GetInt32().ShouldBe(401);
    }
}
