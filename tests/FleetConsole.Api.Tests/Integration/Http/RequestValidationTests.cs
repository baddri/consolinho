using System.Net;
using System.Net.Http.Json;
using System.Text;
using FleetConsole.Api.Tests.Integration.Admin.Users;
using static FleetConsole.Api.Tests.Integration.Admin.Users.UsersApi;

namespace FleetConsole.Api.Tests.Integration.Http;

/// <summary>
/// QA R6: how request bodies that can't become a command are answered, exercised on the first command endpoints
/// (<c>POST /api/admin/users</c>, <c>PUT /api/admin/users/{username}/role</c>) as a writable admin. Model binding
/// failures are framework 400/415 ProblemDetails (no <c>code</c>); well-formed bodies that break field rules are
/// <c>Validation.Failed</c> with camelCase field keys.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class RequestValidationTests(ApiFactory factory)
{
    private static readonly Uri UsersUri = new("/api/admin/users", UriKind.Relative);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("{\"username\":")]                         // malformed JSON
    [InlineData("{\"username\":\"x\",\"role\":\"root\"}")] // unknown enum value
    [InlineData("{\"username\":\"x\",\"role\":1}")]        // enums are strings, never integers
    [InlineData("{\"username\":42}")]                      // wrong JSON type
    public async Task UnbindableBody_Is400ProblemDetails(string json)
    {
        using var client = await factory.LoginAsAsync(factory.NewAdminUsername());

        await ProblemAsync(await PostJsonAsync(client, UsersUri, json), HttpStatusCode.BadRequest, code: null);
    }

    [Fact]
    public async Task QuotedNumberForVersion_Is400()
    {
        using var client = await factory.LoginAsAsync(factory.NewAdminUsername());
        var target = await factory.Data.UserAsync();
        var version = await VersionAsync(client, target.Username);

        await ProblemAsync(
            await PutJsonAsync(client, UserUri(target.Username, "/role"), $"{{\"role\":\"admin\",\"version\":\"{version}\"}}"),
            HttpStatusCode.BadRequest,
            code: null);
        (await GetUserAsync(client, target.Username)).GetProperty("role").GetString().ShouldBe("user");
    }

    [Fact]
    public async Task MissingRequiredProperty_Is400_KeyedByUsername()
    {
        using var client = await factory.LoginAsAsync(factory.NewAdminUsername());

        var problem = await ProblemAsync(await PostJsonAsync(client, UsersUri, "{}"), HttpStatusCode.BadRequest, code: null);

        problem.GetProperty("errors").TryGetProperty("username", out _).ShouldBeTrue(problem.GetRawText());
    }

    [Fact]
    public async Task ValidationErrorKeys_AreCamelCaseJsonPaths()
    {
        using var client = await factory.LoginAsAsync(factory.NewAdminUsername());

        var problem = await ProblemAsync(
            await client.PostAsJsonAsync(UsersUri, new { username = "a/b" }, Ct), HttpStatusCode.BadRequest, "Validation.Failed");

        problem.GetProperty("errors").EnumerateObject().Select(p => p.Name).ShouldBe(["username"]);
    }

    [Fact]
    public async Task WrongContentType_Is415ProblemDetails()
    {
        using var client = await factory.LoginAsAsync(factory.NewAdminUsername());
        using var content = new StringContent("{\"username\":\"x\"}", Encoding.UTF8, "text/plain");

        await ProblemAsync(await client.PostAsync(UsersUri, content, Ct), HttpStatusCode.UnsupportedMediaType, code: null);
    }

    private static async Task<HttpResponseMessage> PostJsonAsync(HttpClient client, Uri uri, string json)
    {
        using var content = new StringContent(json, Encoding.UTF8, "application/json");
        return await client.PostAsync(uri, content, Ct);
    }

    private static async Task<HttpResponseMessage> PutJsonAsync(HttpClient client, Uri uri, string json)
    {
        using var content = new StringContent(json, Encoding.UTF8, "application/json");
        return await client.PutAsync(uri, content, Ct);
    }
}
