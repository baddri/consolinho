using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Integration.Admin.Grants;

/// <summary>Request helpers and below-HTTP counts for the grant endpoint tests (contract §9).</summary>
internal static class GrantsApi
{
    public const string GrantsPath = "/api/admin/grants";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>POST /api/admin/grants.</summary>
    public static Task<HttpResponseMessage> CreateAsync(
        HttpClient client, string username, string clusterName, Guid credentialId, string accessMode = "readOnly") =>
        client.PostAsJsonAsync(GrantsPath, new { username, clusterName, credentialId, accessMode }, Ct);

    /// <summary>PUT /api/admin/grants/{id}.</summary>
    public static Task<HttpResponseMessage> UpdateAsync(HttpClient client, Guid grantId, string accessMode, Guid credentialId, uint version) =>
        client.PutAsJsonAsync($"{GrantsPath}/{grantId}", new { accessMode, credentialId, version }, Ct);

    /// <summary>DELETE /api/admin/grants/{id}.</summary>
    public static Task<HttpResponseMessage> RevokeAsync(HttpClient client, Guid grantId) =>
        client.DeleteAsync(new Uri($"{GrantsPath}/{grantId}", UriKind.Relative), Ct);

    /// <summary>POST /api/admin/users/{username}/grants/bulk with (cluster, credential) items.</summary>
    public static Task<HttpResponseMessage> BulkAsync(
        HttpClient client, string username, string accessMode, params (string ClusterName, Guid CredentialId)[] items) =>
        client.PostAsJsonAsync(
            $"/api/admin/users/{username}/grants/bulk",
            new { accessMode, items = items.Select(i => new { clusterName = i.ClusterName, credentialId = i.CredentialId }) },
            Ct);

    /// <summary>GETs a path that returns a JSON array and returns its elements.</summary>
    public static async Task<IReadOnlyList<JsonElement>> GetArrayAsync(HttpClient client, string path)
    {
        using var response = await client.GetAsync(new Uri(path, UriKind.Relative), Ct);
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        return [.. body.EnumerateArray()];
    }

    /// <summary>GET /api/admin/users/{username}/grants.</summary>
    public static Task<IReadOnlyList<JsonElement>> UserGrantsAsync(HttpClient client, string username) =>
        GetArrayAsync(client, $"/api/admin/users/{username}/grants");

    /// <summary>GET /api/admin/clusters/{name}/grants.</summary>
    public static Task<IReadOnlyList<JsonElement>> ClusterGrantsAsync(HttpClient client, string clusterName) =>
        GetArrayAsync(client, $"/api/admin/clusters/{clusterName}/grants");

    /// <summary>The <c>grant.*</c> audit entries about <paramref name="username"/>, oldest first.</summary>
    public static async Task<IReadOnlyList<AuditEntry>> GrantAuditAsync(ApiFactory factory, string username)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var readModel = scope.ServiceProvider.GetRequiredService<IReadModel>();
        var query = readModel.AuditEntries
            .Where(e => e.Category == AuditCategory.Grants && e.RelatedUsername == username)
            .OrderBy(e => e.OccurredAt);
        return await readModel.ToListAsync(query, Ct);
    }

    /// <summary>The number of stored grants of <paramref name="username"/>, read below HTTP.</summary>
    public static async Task<int> GrantCountAsync(ApiFactory factory, string username)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var readModel = scope.ServiceProvider.GetRequiredService<IReadModel>();
        var name = Username.Create(username).Value;
        var query = from g in readModel.Grants
                    join u in readModel.Users on g.UserId equals u.Id
                    where u.Username == name
                    select g.Id;
        return await readModel.CountAsync(query, Ct);
    }
}
