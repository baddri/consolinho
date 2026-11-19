using System.Buffers.Text;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace FleetConsole.Api.Tests.Integration.Admin.Credentials;

/// <summary>
/// HTTP helpers for the credential endpoint tests: obviously fake tokens (unsigned JWTs with chosen claims, opaque
/// <c>sha256~</c> tokens) and thin wrappers over the routes that return the raw body too, for leak scans.
/// </summary>
internal static class CredentialApi
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>An unsigned JWT (fake signature) with the given payload claims, unique per call through <c>jti</c>.</summary>
    public static string Jwt(string sub = "system:serviceaccount:fleet:viewer", DateTimeOffset? exp = null, DateTimeOffset? iat = null)
    {
        var claims = new Dictionary<string, object> { ["sub"] = sub, ["jti"] = TestData.Unique() };
        if (exp is { } e)
        {
            claims["exp"] = e.ToUnixTimeSeconds();
        }

        if (iat is { } i)
        {
            claims["iat"] = i.ToUnixTimeSeconds();
        }

        return $"{Segment("""{"alg":"RS256","kid":"fake"}""")}.{Segment(JsonSerializer.Serialize(claims))}.ZmFrZS1zaWduYXR1cmU";
    }

    /// <summary>A unique opaque OpenShift-style token.</summary>
    public static string Opaque() => $"sha256~fake-{TestData.Unique()}{TestData.Unique()}";

    /// <summary>A unique valid credential name.</summary>
    public static string NewName() => $"cred-{TestData.Unique()}";

    /// <summary>The per-cluster credentials route.</summary>
    public static Uri ClusterCredentials(string cluster, string suffix = "") =>
        new($"/api/admin/clusters/{cluster}/credentials{suffix}", UriKind.Relative);

    /// <summary>POSTs an add request.</summary>
    public static Task<HttpResponseMessage> AddAsync(HttpClient client, string cluster, string name, string token, string? description = null) =>
        client.PostAsJsonAsync(ClusterCredentials(cluster), new { name, description, token }, Ct);

    /// <summary>PUTs a rotate request.</summary>
    public static Task<HttpResponseMessage> RotateAsync(HttpClient client, string cluster, Guid id, string token, uint version) =>
        client.PutAsJsonAsync(ClusterCredentials(cluster, $"/{id}/token"), new { token, version }, Ct);

    /// <summary>Adds a credential and returns its representation (asserting 201).</summary>
    public static async Task<JsonElement> AddOkAsync(HttpClient client, string cluster, string token, string? name = null)
    {
        using var response = await AddAsync(client, cluster, name ?? NewName(), token);
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        return await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
    }

    /// <summary>GETs a URL, asserts 200 and returns the raw body.</summary>
    public static async Task<string> GetBodyAsync(HttpClient client, string url)
    {
        using var response = await client.GetAsync(new Uri(url, UriKind.Relative), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return await response.Content.ReadAsStringAsync(Ct);
    }

    /// <summary>Asserts a ProblemDetails response with the given status and <c>code</c>; returns the body.</summary>
    public static async Task<JsonElement> ShouldBeProblemAsync(HttpResponseMessage response, HttpStatusCode status, string? code)
    {
        response.StatusCode.ShouldBe(status);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        if (code is not null)
        {
            body.GetProperty("code").GetString().ShouldBe(code);
        }

        return body;
    }

    /// <summary>Finds a credential by id in a list body.</summary>
    public static JsonElement? Find(JsonElement list, Guid id) =>
        list.EnumerateArray().Cast<JsonElement?>().FirstOrDefault(c => c!.Value.GetProperty("id").GetGuid() == id);

    private static string Segment(string text) => Base64Url.EncodeToString(Encoding.UTF8.GetBytes(text));
}
