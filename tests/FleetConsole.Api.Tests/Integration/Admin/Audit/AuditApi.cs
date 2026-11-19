using System.Net;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using FleetConsole.Api.Tests.Persistence;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Integration.Admin.Audit;

/// <summary>
/// Helpers for the <c>/api/admin/audit</c> tests: one shared admin session per host (the emulator's user pools are
/// finite), audit entries seeded with chosen timestamps and names, and page reads.
/// </summary>
internal static class AuditApi
{
    private static readonly ConditionalWeakTable<ApiFactory, Task<HttpClient>> AdminClients = [];

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>
    /// A signed-in admin-by-assignment client, created once per host and reused by every audit test (the audit
    /// endpoint is read-only, so tests can't disturb each other through it).
    /// </summary>
    public static Task<HttpClient> AdminAsync(ApiFactory factory) =>
        AdminClients.GetValue(factory, static f => CreateAdminAsync(f));

    /// <summary>The audit URL with the given query-string parameters (null values omitted, values escaped).</summary>
    public static Uri AuditUri(params (string Name, string? Value)[] parameters)
    {
        var query = string.Join('&', parameters
            .Where(p => p.Value is not null)
            .Select(p => $"{p.Name}={Uri.EscapeDataString(p.Value!)}"));
        return new Uri(query.Length == 0 ? "/api/admin/audit" : $"/api/admin/audit?{query}", UriKind.Relative);
    }

    /// <summary>GETs one page, asserting 200.</summary>
    public static async Task<JsonElement> PageAsync(HttpClient client, params (string Name, string? Value)[] parameters)
    {
        using var response = await client.GetAsync(AuditUri(parameters), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
        return await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
    }

    /// <summary>The ids of a page's items, in order.</summary>
    public static Guid[] Ids(JsonElement page) =>
        [.. page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetGuid())];

    /// <summary>
    /// Writes one audit entry directly (below HTTP), so tests control its timestamp and names. Saved through the real
    /// repository and unit of work in a signed-in scope.
    /// </summary>
    public static async Task<Guid> SeedAsync(
        ApiFactory factory,
        DateTimeOffset at,
        string actor,
        string action,
        string target,
        string? cluster = null,
        string? related = null,
        AuditTargetType targetType = AuditTargetType.User)
    {
        var entry = AuditEntry.Record(
            new AuditActor(null, actor, IsSystem: false),
            action,
            targetType,
            targetId: null,
            target,
            cluster,
            $"{actor} {action} {target}.",
            correlationId: null,
            "{}",
            at,
            related);

        await using var scope = factory.Services.CreateSignedInScope(TestData.Actor);
        scope.ServiceProvider.GetRequiredService<IAuditEntryRepository>().Add(entry);
        await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
        return entry.Id.Value;
    }

    private static async Task<HttpClient> CreateAdminAsync(ApiFactory factory)
    {
        var admin = await factory.Data.UserAsync(role: UserRole.Admin);
        return await factory.LoginAsAsync(admin.Username);
    }
}
