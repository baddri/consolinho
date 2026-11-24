using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Api.Tests.Integration.Hosting;

namespace FleetConsole.Api.Tests.Integration;

[Collection(ApiCollectionDefinition.Name)]
public sealed class SystemEndpointsTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task GetSystemInfo_Returns200_WithVersionAndEnvironment()
    {
        using var client = factory.CreateApiClient();

        using var response = await client.GetAsync(new Uri("/api/system/info", UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/json");
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        json.EnumerateObject().Select(p => p.Name).ShouldBe(["version", "environment"], ignoreOrder: true);
        json.GetProperty("version").GetString().ShouldNotBeNullOrWhiteSpace();
        json.GetProperty("environment").GetString().ShouldBe("Development");
    }

    [Theory]
    [InlineData("/health")]
    [InlineData("/alive")]
    public async Task HealthEndpoints_AreHealthy(string path)
    {
        // /health includes the ConsoleDbContext health check (registered by the Aspire Npgsql integration), so this
        // also proves the Api reaches the database.
        using var client = factory.CreateApiClient();

        using var response = await Readiness.GetWhenReadyAsync(client, path, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await response.Content.ReadAsStringAsync(Ct)).ShouldBe("Healthy");
    }
}
