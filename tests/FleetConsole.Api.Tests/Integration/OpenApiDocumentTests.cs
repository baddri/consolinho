using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// Guards the OpenAPI document the frontend generates its types from: typed success schemas come from the endpoints'
/// <c>ToHttpResult()</c> unions, error responses from the <c>/api</c> group conventions.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class OpenApiDocumentTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task SystemInfo_HasOperationIdAndTyped200Schema()
    {
        var document = await GetDocumentAsync();

        var get = document.GetProperty("paths").GetProperty("/api/system/info").GetProperty("get");
        get.GetProperty("operationId").GetString().ShouldBe("GetSystemInfo");

        var schemaRef = get.GetProperty("responses").GetProperty("200")
            .GetProperty("content").GetProperty("application/json")
            .GetProperty("schema").GetProperty("$ref").GetString();
        schemaRef.ShouldBe("#/components/schemas/SystemInfo");

        var properties = document.GetProperty("components").GetProperty("schemas")
            .GetProperty("SystemInfo").GetProperty("properties");
        properties.GetProperty("version").GetProperty("type").GetString().ShouldBe("string");
        properties.GetProperty("environment").GetProperty("type").GetString().ShouldBe("string");
    }

    [Theory]
    [InlineData("400", "HttpValidationProblemDetails")]
    [InlineData("401", "ProblemDetails")]
    [InlineData("403", "ProblemDetails")]
    [InlineData("404", "ProblemDetails")]
    [InlineData("409", "ProblemDetails")]
    [InlineData("500", "ProblemDetails")]
    public async Task ApiOperations_DocumentGroupLevelProblemResponses(string status, string schema)
    {
        var document = await GetDocumentAsync();

        var response = document.GetProperty("paths").GetProperty("/api/system/info").GetProperty("get")
            .GetProperty("responses").GetProperty(status);
        response.GetProperty("content").GetProperty("application/problem+json")
            .GetProperty("schema").GetProperty("$ref").GetString()
            .ShouldBe($"#/components/schemas/{schema}");
    }

    [Theory]
    [InlineData("ProblemDetails")]
    [InlineData("HttpValidationProblemDetails")]
    public async Task Integers_AreDocumentedAsStrictNumbers(string schema)
    {
        // Strict JSON number handling (AddApiJson): without it ASP.NET documents integers as integer|string, which
        // becomes number|string in the frontend's generated types.
        var document = await GetDocumentAsync();

        var status = document.GetProperty("components").GetProperty("schemas")
            .GetProperty(schema).GetProperty("properties").GetProperty("status");
        status.GetProperty("type").EnumerateArray().Select(e => e.GetString()).ShouldBe(["null", "integer"], ignoreOrder: true);
        status.TryGetProperty("pattern", out _).ShouldBeFalse();
    }

    [Fact]
    public async Task Document_HasNoServers()
    {
        // The SPA client's base URL is the page origin and paths already contain /api (FRONTEND.md): a "/api" server
        // entry would make generated calls hit /api/api/..., and the default (requesting host) is environment-specific.
        var document = await GetDocumentAsync();

        document.TryGetProperty("servers", out _).ShouldBeFalse();
    }

    [Fact]
    public async Task SystemInfo_DocsAreWrittenForConsumers()
    {
        // XML doc comments flow into the document; guard against implementation notes or escaped markup leaking.
        var document = await GetDocumentAsync();

        var get = document.GetProperty("paths").GetProperty("/api/system/info").GetProperty("get");
        get.GetProperty("summary").GetString().ShouldBe("Returns the version and environment of this FleetConsole deployment.");
        var schema = document.GetProperty("components").GetProperty("schemas").GetProperty("SystemInfo");
        schema.GetRawText().ShouldNotContain("&lt;");
        schema.GetRawText().ShouldNotContain("Query");
        schema.GetProperty("required").EnumerateArray().Select(e => e.GetString())
            .ShouldBe(["version", "environment"], ignoreOrder: true);
    }

    private async Task<JsonElement> GetDocumentAsync()
    {
        using var client = factory.CreateApiClient();
        using var response = await client.GetAsync(new Uri("/openapi/v1.json", UriKind.Relative), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
    }
}
