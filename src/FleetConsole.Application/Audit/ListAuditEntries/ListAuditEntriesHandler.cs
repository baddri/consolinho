using System.Text.Json;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Audit.ListAuditEntries;

/// <summary>
/// Answers <see cref="ListAuditEntriesQuery"/> with one SQL statement: filters, keyset condition, ordering and the
/// <c>limit + 1</c> row cap all translate to SQL, so a page costs the same however long the log is.
/// </summary>
/// <remarks>
/// The <c>(OccurredAt DESC, Id DESC)</c> order matches the composite index on <c>audit_entries</c>; <c>Id</c> is the
/// tiebreaker that makes the order total, so the cursor of the last row identifies a unique position. The exact-match
/// filters (<c>actor</c>, <c>user</c>, <c>cluster</c>) hit their own indexes.
/// </remarks>
internal sealed class ListAuditEntriesHandler(IReadModel readModel)
    : IRequestHandler<ListAuditEntriesQuery, Result<AuditPageDto>>
{
    /// <inheritdoc />
    public async Task<Result<AuditPageDto>> Handle(ListAuditEntriesQuery request, CancellationToken cancellationToken)
    {
        var entries = readModel.AuditEntries;

        if (request.Actor is { } actor)
        {
            entries = entries.Where(e => e.Actor.Name == actor);
        }

        if (request.User is { } user)
        {
            // Actor, target user, or user of a target grant (contract §10): RelatedUsername covers the latter two.
            entries = entries.Where(e => e.Actor.Name == user || e.RelatedUsername == user);
        }

        // The validator has already rejected unknown names; TryParse only narrows the type here.
        if (AuditCategoryNames.TryParse(request.Category, out var category))
        {
            entries = entries.Where(e => e.Category == category);
        }

        if (request.Cluster is { } cluster)
        {
            entries = entries.Where(e => e.ClusterName == cluster);
        }

        if (!string.IsNullOrEmpty(request.Target))
        {
            // Case-insensitive substring: SQL lower(target_name) against the value lowered here. EF Core escapes the
            // LIKE wildcards in a Contains() parameter, so '%' and '_' match literally.
            // The culture/StringComparison analyzers don't apply inside the lambda: it is an expression tree translated
            // to SQL lower(), and the overloads they suggest have no SQL translation. ToLowerInvariant and PostgreSQL
            // lower() may disagree on some non-ASCII letters; target names are DNS-like/usernames, so that is accepted.
            var target = request.Target.ToLowerInvariant();
#pragma warning disable CA1304, CA1311, CA1862
            entries = entries.Where(e => e.TargetName.ToLower().Contains(target));
#pragma warning restore CA1304, CA1311, CA1862
        }

        // Clients may send any offset (?from=...+02:00); Npgsql only accepts UTC DateTimeOffset parameters for
        // timestamptz, so normalize to the same instant in UTC.
        if (request.From is { } from)
        {
            var fromUtc = from.ToUniversalTime();
            entries = entries.Where(e => e.OccurredAt >= fromUtc);
        }

        if (request.To is { } to)
        {
            var toUtc = to.ToUniversalTime();
            entries = entries.Where(e => e.OccurredAt < toUtc);
        }

        if (AuditCursor.TryParse(request.Cursor, out var cursor))
        {
            // (occurred_at, id) < (cursor.OccurredAt, cursor.Id), spelled out so it translates on any provider.
            var at = cursor.OccurredAt;
            var id = cursor.Id;
            entries = entries.Where(e => e.OccurredAt < at || (e.OccurredAt == at && e.Id < id));
        }

        var query = entries
            .OrderByDescending(e => e.OccurredAt)
            .ThenByDescending(e => e.Id)
            .Take(request.Limit + 1)
            .Select(e => new AuditRow(
                e.Id,
                e.OccurredAt,
                e.Actor.Name,
                e.Actor.IsSystem,
                e.Action,
                e.Category,
                e.TargetType,
                e.TargetId,
                e.TargetName,
                e.ClusterName,
                e.Summary,
                e.CorrelationId,
                e.DetailsJson));

        var rows = await readModel.ToListAsync(query, cancellationToken).ConfigureAwait(false);

        // The extra row only tells whether another page exists; it is not returned.
        var hasMore = rows.Count > request.Limit;
        var page = hasMore ? rows.GetRange(0, request.Limit) : rows;
        var nextCursor = hasMore ? new AuditCursor(page[^1].OccurredAt, page[^1].Id).Encode() : null;

        return Result.Success(new AuditPageDto(page.ConvertAll(r => r.ToDto()), nextCursor));
    }

    /// <summary>The columns read per entry; details stay a string until after the query.</summary>
    private sealed record AuditRow(
        AuditEntryId Id,
        DateTimeOffset OccurredAt,
        string Actor,
        bool ActorIsSystem,
        string Action,
        AuditCategory Category,
        AuditTargetType TargetType,
        string? TargetId,
        string TargetName,
        string? ClusterName,
        string Summary,
        string? CorrelationId,
        string DetailsJson)
    {
        public AuditEntryDto ToDto() => new(
            Id.Value,
            OccurredAt,
            Actor,
            ActorIsSystem,
            Action,
            Category,
            TargetType,
            TargetId,
            TargetName,
            ClusterName,
            Summary,
            CorrelationId,
            ParseDetails(DetailsJson));

        // Clone() detaches the element from the JsonDocument, which is disposed here.
        private static JsonElement ParseDetails(string json)
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.Clone();
        }
    }
}
