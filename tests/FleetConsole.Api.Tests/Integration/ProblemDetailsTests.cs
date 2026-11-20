using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace FleetConsole.Api.Tests.Integration;

[Collection(ApiCollectionDefinition.Name)]
public sealed class ProblemDetailsTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task UnknownApiRoute_Returns404ProblemDetails()
    {
        using var client = factory.CreateApiClient();

        using var response = await client.GetAsync(new Uri("/api/x", UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        json.GetProperty("status").GetInt32().ShouldBe(404);
        json.GetProperty("title").GetString().ShouldNotBeNullOrEmpty();
        json.GetProperty("type").GetString().ShouldNotBeNullOrEmpty();
        json.GetProperty("instance").GetString().ShouldBe("/api/x");
        json.GetProperty("traceId").GetString().ShouldNotBeNullOrEmpty();
    }

    [Fact]
    public async Task WrongMethodOnKnownRoute_Returns405ProblemDetails()
    {
        using var client = factory.CreateApiClient();
        using var request = new HttpRequestMessage(HttpMethod.Delete, new Uri("/api/system/info", UriKind.Relative));
        request.Headers.Add("X-Console-Request", "1"); // otherwise the CSRF check answers 403 first (ADR-0012)

        using var response = await client.SendAsync(request, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.MethodNotAllowed);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
    }
}
