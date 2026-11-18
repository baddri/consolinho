using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// AUTH-13 / QA R2 / ADR-0012: unsafe requests under <c>/api</c> need <c>X-Console-Request: 1</c>, checked by
/// middleware before authentication and any endpoint, on existing and unknown routes alike.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class CsrfHeaderTests(ApiFactory factory)
{
    private const string HeaderName = "X-Console-Request";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public static TheoryData<string, string> UnsafeRequests => new()
    {
        { "POST", "/api/system/info" },
        { "PUT", "/api/system/info" },
        { "PATCH", "/api/system/info" },
        { "DELETE", "/api/system/info" },
        { "TRACE", "/api/system/info" },
        { "POST", "/api/does-not-exist" },
        { "PUT", "/api/admin/users/alice/role" },
        { "PATCH", "/api/admin/clusters/prod" },
        { "DELETE", "/api/admin/grants/00000000-0000-0000-0000-000000000001" },
        { "POST", "/api" },
        { "POST", "/API/system/info" },
    };

    [Theory]
    [MemberData(nameof(UnsafeRequests))]
    public async Task UnsafeMethod_WithoutHeader_Returns403CsrfProblem(string method, string path)
    {
        using var response = await SendAsync(method, path, headerValue: null);

        await ShouldBeCsrfRejectionAsync(response, path);
    }

    [Theory]
    [MemberData(nameof(UnsafeRequests))]
    public async Task UnsafeMethod_WithHeaderValue1_IsNotRejected(string method, string path)
    {
        using var response = await SendAsync(method, path, headerValue: "1");

        // What happens next is the route's business (405, 404, 401 …); the CSRF check let it through.
        response.StatusCode.ShouldNotBe(HttpStatusCode.Forbidden);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("true")]
    [InlineData("")]
    [InlineData(" 1")]
    public async Task UnsafeMethod_WithWrongHeaderValue_Returns403(string value)
    {
        using var response = await SendAsync("POST", "/api/system/info", value);

        await ShouldBeCsrfRejectionAsync(response, "/api/system/info");
    }

    [Fact]
    public async Task UnsafeMethod_WithRepeatedHeader_Returns403()
    {
        using var client = factory.CreateApiClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri("/api/system/info", UriKind.Relative));
        request.Headers.TryAddWithoutValidation(HeaderName, ["1", "1"]);

        using var response = await client.SendAsync(request, Ct);

        await ShouldBeCsrfRejectionAsync(response, "/api/system/info");
    }

    [Fact]
    public async Task MalformedBody_WithoutHeader_Returns403Not400()
    {
        // Runs before body binding: a garbage body never gets as far as a 400.
        using var client = factory.CreateApiClient();
        using var content = new StringContent("{ not json", System.Text.Encoding.UTF8, "application/json");

        using var response = await client.PostAsync(new Uri("/api/system/info", UriKind.Relative), content, Ct);

        await ShouldBeCsrfRejectionAsync(response, "/api/system/info");
    }

    [Theory]
    [InlineData("GET", "/api/system/info", HttpStatusCode.OK)]
    [InlineData("HEAD", "/api/system/info", HttpStatusCode.MethodNotAllowed)]
    [InlineData("GET", "/api/does-not-exist", HttpStatusCode.NotFound)]
    [InlineData("OPTIONS", "/api/system/info", HttpStatusCode.MethodNotAllowed)]
    public async Task SafeMethods_WithoutHeader_AreUnaffected(string method, string path, HttpStatusCode expected)
    {
        using var response = await SendAsync(method, path, headerValue: null);

        response.StatusCode.ShouldBe(expected);
    }

    [Theory]
    [InlineData("POST", "/apix")]
    [InlineData("DELETE", "/apix/system/info")]
    [InlineData("POST", "/health")]
    [InlineData("PUT", "/some/spa/route")]
    public async Task NonApiPaths_WithoutHeader_AreUnaffected(string method, string path)
    {
        using var response = await SendAsync(method, path, headerValue: null);

        response.StatusCode.ShouldNotBe(HttpStatusCode.Forbidden);
    }

    private async Task<HttpResponseMessage> SendAsync(string method, string path, string? headerValue)
    {
        using var client = factory.CreateApiClient();
        using var request = new HttpRequestMessage(new HttpMethod(method), new Uri(path, UriKind.Relative));
        if (headerValue is not null)
        {
            request.Headers.TryAddWithoutValidation(HeaderName, headerValue);
        }

        return await client.SendAsync(request, Ct);
    }

    private static async Task ShouldBeCsrfRejectionAsync(HttpResponseMessage response, string path)
    {
        response.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        json.GetProperty("status").GetInt32().ShouldBe(403);
        json.GetProperty("code").GetString().ShouldBe("Auth.CsrfHeaderMissing");
        json.GetProperty("detail").GetString().ShouldBe("Missing CSRF header.");
        json.GetProperty("instance").GetString().ShouldBe(path);
        json.GetProperty("traceId").GetString().ShouldNotBeNullOrEmpty();
    }
}
