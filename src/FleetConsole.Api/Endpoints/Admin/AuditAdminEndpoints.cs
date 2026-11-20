using FleetConsole.Api.Http;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Api.OpenApi;
using FleetConsole.Application.Audit.ListAuditEntries;
using FleetConsole.Domain.Audit;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace FleetConsole.Api.Endpoints.Admin;

/// <summary>
/// <c>/api/admin/audit</c>: the read-only audit log (contract §10, AUD-4/AUD-5). There is deliberately no write route:
/// entries are only ever written by the commands they describe (AUD-3).
/// </summary>
/// <remarks>
/// Read-only admins may call it (the query is an <c>IAdminRequest</c>, not a mutating command). Validation of the filters
/// and the cursor happens in the pipeline (<see cref="ListAuditEntriesValidator"/>), so bad values come back as
/// field errors keyed by parameter name.
/// </remarks>
public static class AuditAdminEndpoints
{
    /// <summary>Maps the audit endpoints into the <c>/api/admin</c> group.</summary>
    /// <param name="admin">The <c>/api/admin</c> group.</param>
    /// <returns>The <c>/api/admin/audit</c> group.</returns>
    public static RouteGroupBuilder MapAuditAdminEndpoints(this RouteGroupBuilder admin)
    {
        ArgumentNullException.ThrowIfNull(admin);

        var audit = admin.MapGroup("/audit").WithTags("Audit");

        // category is bound as a string so an unknown value is a 400 keyed "category" from the validator (contract §10),
        // but published as AuditCategory so clients see the allowed values (T-0048).
        audit.MapGet("", ListAuditEntries)
            .WithName("ListAuditEntries")
            .WithQueryParameterSchema<AuditCategory>("category");

        return audit;
    }

    // XML docs on the handlers are published as OpenAPI summaries (written for API consumers); implementation notes are
    // in // comments.

    /// <summary>
    /// Lists audit entries newest first, one page at a time. Filters are optional and combined with AND. Pass the
    /// nextCursor of a page as cursor to get the next (older) page; pages stay consistent while new entries are written.
    /// </summary>
    /// <param name="request">The filters and paging parameters from the query string.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the page.</returns>
    internal static async Task<Results<Ok<AuditPageDto>, ProblemHttpResult>> ListAuditEntries(
        [AsParameters] ListAuditEntriesRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var query = new ListAuditEntriesQuery(
            request.Actor,
            request.User,
            request.Category,
            request.Cluster,
            request.Target,
            request.From,
            request.To,
            request.Cursor,
            request.Limit ?? ListAuditEntriesQuery.DefaultLimit);
        return (await dispatcher.Send(query, cancellationToken).ConfigureAwait(false)).ToHttpResult();
    }
}

/// <summary>Query-string parameters of <c>GET /api/admin/audit</c> (contract §10), bound with <c>[AsParameters]</c>.</summary>
/// <param name="Actor">Exact actor name, e.g. alice or "system (config)".</param>
/// <param name="User">Username that is the actor, the target user, or the user of a target grant.</param>
/// <param name="Category">auth, users, clusters, credentials or grants.</param>
/// <param name="Cluster">Exact cluster name.</param>
/// <param name="Target">Case-insensitive substring of the target display name.</param>
/// <param name="From">Only entries at or after this time (ISO 8601).</param>
/// <param name="To">Only entries before this time (ISO 8601).</param>
/// <param name="Cursor">The nextCursor of the previous page.</param>
/// <param name="Limit">Page size, 1 to 200 (default 50).</param>
// Explicit names: [AsParameters] would otherwise publish the PascalCase property names in the OpenAPI document
// (binding is case-insensitive either way); the contract's parameters are camelCase.
public sealed record ListAuditEntriesRequest(
    [FromQuery(Name = "actor")] string? Actor,
    [FromQuery(Name = "user")] string? User,
    [FromQuery(Name = "category")] string? Category,
    [FromQuery(Name = "cluster")] string? Cluster,
    [FromQuery(Name = "target")] string? Target,
    [FromQuery(Name = "from")] DateTimeOffset? From,
    [FromQuery(Name = "to")] DateTimeOffset? To,
    [FromQuery(Name = "cursor")] string? Cursor,
    [FromQuery(Name = "limit")] int? Limit);
