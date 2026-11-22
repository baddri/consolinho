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

    [Theory]
    [InlineData("ProblemDetails")]
    [InlineData("HttpValidationProblemDetails")]
    public async Task ProblemSchemas_DeclareCodeAndTraceIdExtensions(string schema)
    {
        // Contract §1 (orchestrator amendment): the extensions must reach the frontend's generated types.
        var document = await GetDocumentAsync();

        var properties = document.GetProperty("components").GetProperty("schemas")
            .GetProperty(schema).GetProperty("properties");
        properties.GetProperty("code").GetProperty("type").GetString().ShouldBe("string");
        properties.GetProperty("traceId").GetProperty("type").GetString().ShouldBe("string");
    }

    [Fact]
    public async Task Enums_AreCamelCaseStrings()
    {
        // AddApiJson registers JsonStringEnumConverter (camelCase, no integers; ADR-0013). CurrentUser.role is the first
        // enum in the contract; the schema may be inline or a $ref to a shared enum schema. Microsoft.AspNetCore.OpenApi
        // (.NET 10) emits string enums without "type"; StringEnumSchemaTransformer adds "type": "string".
        var document = await GetDocumentAsync();
        var schemas = document.GetProperty("components").GetProperty("schemas");

        var role = schemas.GetProperty("CurrentUser").GetProperty("properties").GetProperty("role");
        if (role.TryGetProperty("$ref", out var reference))
        {
            role = schemas.GetProperty(reference.GetString()!["#/components/schemas/".Length..]);
        }

        role.GetProperty("type").GetString().ShouldBe("string");

        var values = role.GetProperty("enum").EnumerateArray().ToArray();
        values.ShouldAllBe(v => v.ValueKind == JsonValueKind.String);
        values.Select(v => v.GetString()).ShouldBe(["admin", "user"], ignoreOrder: true);
    }

    [Fact]
    public async Task EnumComponents_NeverContainNull()
    {
        // T-0047: .NET 10 builds a shared enum component from a nullable property (ConnectionTestStep?) and appends null
        // to its values, which would make every use of the enum nullable in the generated TS types.
        // StringEnumSchemaTransformer strips it; nullability stays on the referencing property.
        var document = await GetDocumentAsync();
        var schemas = document.GetProperty("components").GetProperty("schemas");

        var enums = schemas.EnumerateObject().Where(s => s.Value.TryGetProperty("enum", out _)).ToArray();
        enums.Select(s => s.Name).ShouldContain("ConnectionTestStep");
        enums.Select(s => s.Name).ShouldContain("CapabilityLevel");
        foreach (var component in enums)
        {
            component.Value.GetProperty("enum").EnumerateArray().ShouldAllBe(
                v => v.ValueKind == JsonValueKind.String, $"{component.Name} has a non-string enum value");
            component.Value.GetProperty("type").ValueKind.ShouldBe(JsonValueKind.String, $"{component.Name} type is not plain");
            component.Value.GetProperty("type").GetString().ShouldBe("string");
        }
    }

    [Theory]
    [InlineData("ConnectionTestSummary", "failedStep", "ConnectionTestStep")]
    [InlineData("ConnectionTestSummary", "headline", "CapabilityLevel")]
    [InlineData("ConnectionTestResult", "detectedDistribution", "ClusterDistribution")]
    [InlineData("ConnectionTestStepResult", "failureKind", "ProbeFailureKind")]
    // T-0154: a get-only property (no setter to read write-nullability from) lost the null branch.
    [InlineData("NamespaceRules", "failureKind", "ProbeFailureKind")]
    public async Task NullableEnumProperties_StayNullableAtTheReference(string schema, string property, string enumSchema)
    {
        var document = await GetDocumentAsync();

        var oneOf = document.GetProperty("components").GetProperty("schemas").GetProperty(schema)
            .GetProperty("properties").GetProperty(property).GetProperty("oneOf").EnumerateArray().ToArray();

        oneOf.Where(s => s.TryGetProperty("type", out _)).Select(s => s.GetProperty("type").GetString()).ShouldBe(["null"]);
        oneOf.Where(s => s.TryGetProperty("$ref", out _)).Select(s => s.GetProperty("$ref").GetString())
            .ShouldBe([$"#/components/schemas/{enumSchema}"]);
    }

    [Theory]
    [InlineData("/api/auth/login", "get", "Login")]
    [InlineData("/api/auth/logout", "post", "Logout")]
    [InlineData("/api/auth/me", "get", "GetCurrentUser")]
    public async Task AuthOperations_HaveContractOperationIds(string path, string method, string operationId)
    {
        var document = await GetDocumentAsync();

        document.GetProperty("paths").GetProperty(path).GetProperty(method)
            .GetProperty("operationId").GetString().ShouldBe(operationId);
    }

    [Fact]
    public async Task CurrentUser_IsTheTyped200SchemaOfMe()
    {
        var document = await GetDocumentAsync();

        document.GetProperty("paths").GetProperty("/api/auth/me").GetProperty("get")
            .GetProperty("responses").GetProperty("200").GetProperty("content").GetProperty("application/json")
            .GetProperty("schema").GetProperty("$ref").GetString().ShouldBe("#/components/schemas/CurrentUser");
        var schema = document.GetProperty("components").GetProperty("schemas").GetProperty("CurrentUser");
        schema.GetProperty("required").EnumerateArray().Select(e => e.GetString()).ShouldBe(
            ["username", "displayName", "role", "isReadOnly", "groups", "isAdminViaConfiguration", "adminConfigurationSource"],
            ignoreOrder: true);
    }

    [Fact]
    public async Task NamespaceRules_RequiresAllSixFields()
    {
        var document = await GetDocumentAsync();

        // Contract C: every field is present (nullable ones as null), so schema.gen.ts must not make them optional.
        var schema = document.GetProperty("components").GetProperty("schemas").GetProperty("NamespaceRules");
        schema.GetProperty("required").EnumerateArray().Select(e => e.GetString()).ShouldBe(
            ["namespace", "incomplete", "evaluationError", "rules", "error", "failureKind"],
            ignoreOrder: true);
    }

    [Theory]
    [InlineData("/api/admin/users", "get", "ListUsers")]
    [InlineData("/api/admin/users", "post", "CreateUser")]
    [InlineData("/api/admin/users/{username}", "get", "GetUser")]
    [InlineData("/api/admin/users/{username}/role", "put", "ChangeUserRole")]
    [InlineData("/api/admin/users/{username}/read-only", "put", "SetUserReadOnly")]
    [InlineData("/api/admin/users/{username}/deactivate", "post", "DeactivateUser")]
    [InlineData("/api/admin/users/{username}/reactivate", "post", "ReactivateUser")]
    public async Task UserOperations_HaveContractOperationIds(string path, string method, string operationId)
    {
        var document = await GetDocumentAsync();

        var operation = document.GetProperty("paths").GetProperty(path).GetProperty(method);
        operation.GetProperty("operationId").GetString().ShouldBe(operationId);
        operation.GetProperty("tags").EnumerateArray().Select(t => t.GetString()).ShouldContain("Users");
    }

    [Fact]
    public async Task UserSchemas_DropTheDtoSuffix_AndPublishStatusAsStringEnum()
    {
        var document = await GetDocumentAsync();
        var schemas = document.GetProperty("components").GetProperty("schemas");

        document.GetProperty("paths").GetProperty("/api/admin/users").GetProperty("get")
            .GetProperty("responses").GetProperty("200").GetProperty("content").GetProperty("application/json")
            .GetProperty("schema").GetProperty("items").GetProperty("$ref").GetString()
            .ShouldBe("#/components/schemas/UserListItem");
        var detail = schemas.GetProperty("UserDetail");
        detail.GetProperty("required").EnumerateArray().Select(e => e.GetString()).ShouldContain("version");
        schemas.TryGetProperty("UserDetailDto", out _).ShouldBeFalse();

        var status = schemas.GetProperty("UserStatus");
        status.GetProperty("type").GetString().ShouldBe("string");
        status.GetProperty("enum").EnumerateArray().Select(v => v.GetString())
            .ShouldBe(["pending", "active", "deactivated"], ignoreOrder: true);
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

    [Fact]
    public async Task AuditCategoryQueryParameter_ReferencesTheAuditCategoryEnum()
    {
        // T-0048: bound as a string (unknown values are a 400 keyed "category"), published as the enum.
        var document = await GetDocumentAsync();

        var category = document.GetProperty("paths").GetProperty("/api/admin/audit").GetProperty("get")
            .GetProperty("parameters").EnumerateArray()
            .Single(p => p.GetProperty("name").GetString() == "category" && p.GetProperty("in").GetString() == "query");
        category.GetProperty("schema").GetProperty("$ref").GetString().ShouldBe("#/components/schemas/AuditCategory");

        var component = document.GetProperty("components").GetProperty("schemas").GetProperty("AuditCategory");
        component.GetProperty("type").GetString().ShouldBe("string");
        component.GetProperty("enum").EnumerateArray().Select(v => v.GetString())
            .ShouldBe(["auth", "users", "clusters", "credentials", "grants", "proxy"], ignoreOrder: true);
    }

    private async Task<JsonElement> GetDocumentAsync()
    {
        using var client = factory.CreateApiClient();
        using var response = await client.GetAsync(new Uri("/openapi/v1.json", UriKind.Relative), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
    }
}
