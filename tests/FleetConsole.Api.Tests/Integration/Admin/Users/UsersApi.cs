using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace FleetConsole.Api.Tests.Integration.Admin.Users;

/// <summary>
/// Small HTTP helpers for the <c>/api/admin/users</c> tests: read a user, send a transition with the user's current
/// version, and assert ProblemDetails responses.
/// </summary>
internal static class UsersApi
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>The URL of one user (escaped, usernames may contain ':' or '@').</summary>
    public static Uri UserUri(string username, string suffix = "") =>
        new($"/api/admin/users/{Uri.EscapeDataString(username)}{suffix}", UriKind.Relative);

    /// <summary>GET /api/admin/users/{username}, asserting 200.</summary>
    public static async Task<JsonElement> GetUserAsync(HttpClient client, string username)
    {
        using var response = await client.GetAsync(UserUri(username), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
    }

    /// <summary>The user's current <c>version</c>.</summary>
    public static async Task<uint> VersionAsync(HttpClient client, string username) =>
        (await GetUserAsync(client, username)).GetProperty("version").GetUInt32();

    /// <summary>PUT .../role with the current version.</summary>
    public static async Task<HttpResponseMessage> ChangeRoleAsync(HttpClient client, string username, string role, uint? version = null) =>
        await client.PutAsJsonAsync(UserUri(username, "/role"), new { role, version = version ?? await VersionAsync(client, username) }, Ct);

    /// <summary>PUT .../read-only with the current version.</summary>
    public static async Task<HttpResponseMessage> SetReadOnlyAsync(HttpClient client, string username, bool isReadOnly) =>
        await client.PutAsJsonAsync(UserUri(username, "/read-only"), new { isReadOnly, version = await VersionAsync(client, username) }, Ct);

    /// <summary>POST .../deactivate or .../reactivate with the current version.</summary>
    public static async Task<HttpResponseMessage> TransitionAsync(HttpClient client, string username, string action) =>
        await client.PostAsJsonAsync(UserUri(username, "/" + action), new { version = await VersionAsync(client, username) }, Ct);

    /// <summary>Asserts a 200 and returns the body.</summary>
    public static async Task<JsonElement> OkAsync(HttpResponseMessage response)
    {
        using (response)
        {
            response.StatusCode.ShouldBe(HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
            return await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        }
    }

    /// <summary>Asserts a ProblemDetails response with <paramref name="status"/> and <paramref name="code"/>.</summary>
    /// <returns>The body.</returns>
    public static async Task<JsonElement> ProblemAsync(HttpResponseMessage response, HttpStatusCode status, string? code)
    {
        using (response)
        {
            response.StatusCode.ShouldBe(status, await response.Content.ReadAsStringAsync(Ct));
            response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
            var body = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
            if (code is not null)
            {
                body.GetProperty("code").GetString().ShouldBe(code);
            }

            return body;
        }
    }
}
