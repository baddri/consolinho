using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using static FleetConsole.Api.Tests.DevOAuth.DevOAuthFlow;

namespace FleetConsole.Api.Tests.DevOAuth;

public sealed class DevOAuthDiscoveryTests(DevOAuthFactory factory) : IClassFixture<DevOAuthFactory>
{
    [Fact]
    public async Task Discovery_ReturnsOpenShiftMetadata_WithUrlsFromRequestOrigin()
    {
        using var client = factory.CreateNonRedirectingClient();

        using var response = await client.GetAsync(new Uri("/.well-known/oauth-authorization-server", UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/json");
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        json.EnumerateObject().Select(p => p.Name).ShouldBe(
        [
            "issuer", "authorization_endpoint", "token_endpoint", "scopes_supported", "response_types_supported",
            "grant_types_supported", "code_challenge_methods_supported",
        ], ignoreOrder: true);
        json.GetProperty("issuer").GetString().ShouldBe("http://localhost");
        json.GetProperty("authorization_endpoint").GetString().ShouldBe("http://localhost/oauth/authorize");
        json.GetProperty("token_endpoint").GetString().ShouldBe("http://localhost/oauth/token");
        Strings(json, "scopes_supported").ShouldBe(["user:info", "user:check-access", "user:full"]);
        Strings(json, "response_types_supported").ShouldBe(["code", "token"]);
        Strings(json, "grant_types_supported").ShouldBe(["authorization_code", "implicit"]);
        Strings(json, "code_challenge_methods_supported").ShouldBe(["plain", "S256"]);
    }

    [Theory]
    [InlineData("/health")]
    [InlineData("/alive")]
    public async Task HealthEndpoints_AreHealthy(string path)
    {
        // The AppHost's WithHttpHealthCheck("/health") relies on this.
        using var client = factory.CreateNonRedirectingClient();

        using var response = await client.GetAsync(new Uri(path, UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    private static string?[] Strings(JsonElement json, string property) =>
        json.GetProperty(property).EnumerateArray().Select(e => e.GetString()).ToArray();
}
