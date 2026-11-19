using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Audit;

namespace FleetConsole.Application.Audit.ListAuditEntries;

/// <summary>
/// Reads one newest-first page of the audit log (AUD-4, <c>GET /api/admin/audit</c>, contract §10). All filters are
/// optional and combined with AND; paging is keyset-based (ADR-0013 §7), so pages stay free of duplicates and gaps while
/// new entries are written between requests.
/// </summary>
/// <remarks>
/// <para>Readable by read-only admins (AUD-5): an <see cref="IAdminRequest"/>, not an <see cref="IMutatingCommand"/>.</para>
/// <para><see cref="Category"/> is a string so that an unknown value becomes a <c>category</c> field error from
/// <see cref="ListAuditEntriesValidator"/> instead of a framework binding error (contract §10 amendment).</para>
/// </remarks>
/// <param name="Actor">Exact actor name (<c>alice</c>, <c>system (config)</c>).</param>
/// <param name="User">Username that is the actor or the related user (target user, or the user of a target grant).</param>
/// <param name="Category">An <see cref="AuditCategory"/> name in camelCase (case-insensitive).</param>
/// <param name="Cluster">Exact cluster name.</param>
/// <param name="Target">Case-insensitive substring of the target display name.</param>
/// <param name="From">Inclusive lower bound of <see cref="AuditEntry.OccurredAt"/>.</param>
/// <param name="To">Exclusive upper bound of <see cref="AuditEntry.OccurredAt"/>.</param>
/// <param name="Cursor">Opaque <see cref="AuditPageDto.NextCursor"/> of the previous page, or null for the first page.</param>
/// <param name="Limit">Page size, 1–200.</param>
public sealed record ListAuditEntriesQuery(
    string? Actor = null,
    string? User = null,
    string? Category = null,
    string? Cluster = null,
    string? Target = null,
    DateTimeOffset? From = null,
    DateTimeOffset? To = null,
    string? Cursor = null,
    int Limit = ListAuditEntriesQuery.DefaultLimit) : IQuery<AuditPageDto>, IAdminRequest
{
    /// <summary>Page size when the caller doesn't choose one.</summary>
    public const int DefaultLimit = 50;

    /// <summary>Largest page size a caller may request.</summary>
    public const int MaxLimit = 200;
}
