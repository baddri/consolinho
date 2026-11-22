using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Common;
using FleetConsole.Application.Credentials;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using Microsoft.Extensions.Options;

namespace FleetConsole.Application.Clusters.ListClusters;

/// <summary>
/// Answers <see cref="ListClustersQuery"/> with <b>one</b> read-model query (no N+1): each cluster row with its grant
/// count (correlated subquery) and the expiry/test columns of its credentials (a collection projection EF Core loads
/// in the same statement). The roll-ups are computed in memory, because expiry status depends on the clock and the
/// configured window, and staleness on the cluster's <c>ConnectionSettingsChangedAt</c>. At ~40 clusters with a few
/// credentials each, the extra rows are negligible.
/// </summary>
/// <param name="readModel">No-tracking queryables.</param>
/// <param name="clock">"Now" for the expiry status.</param>
/// <param name="credentialsOptions">The "expiring soon" window (<c>Credentials:ExpiryWarningDays</c>).</param>
internal sealed class ListClustersHandler(IReadModel readModel, IClock clock, IOptions<CredentialsOptions> credentialsOptions)
    : IRequestHandler<ListClustersQuery, Result<IReadOnlyList<ClusterListItemDto>>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<ClusterListItemDto>>> Handle(ListClustersQuery request, CancellationToken cancellationToken)
    {
        // Locals so EF Core inlines the queryables as subqueries of the cluster query (one SQL statement).
        var credentials = readModel.Credentials;
        var grants = readModel.Grants;
        var query = readModel.Clusters.Select(c => new
        {
            c.Name,
            c.DisplayName,
            c.Environment,
            c.Distribution,
            c.Endpoint,
            c.IsEnabled,
            c.ConnectionSettingsChangedAt,
            c.Version,
            GrantCount = grants.Count(g => g.ClusterId == c.Id),

            // Translated into a join of the same statement; never the token column.
            Credentials = credentials
                .Where(cr => cr.ClusterId == c.Id)
                .Select(cr => new { cr.Name, cr.Metadata, cr.LastTest })
                .ToList(),
        });

        var rows = await readModel.ToListAsync(query, cancellationToken).ConfigureAwait(false);

        var now = clock.UtcNow;
        var window = credentialsOptions.Value.ExpiryWarningWindow;
        var items = rows
            .Select(row =>
            {
                var newestTest = row.Credentials
                    .Where(cr => cr.LastTest is not null)
                    .MaxBy(cr => cr.LastTest!.TestedAt);
                return new ClusterListItemDto(
                    row.Name.Value,
                    row.DisplayName,
                    row.Environment,
                    row.Distribution,
                    row.Endpoint.ToString(),
                    row.IsEnabled,
                    row.Endpoint.TlsMode,
                    row.Credentials.Count,
                    Worst(row.Credentials.Select(cr => cr.Metadata.StatusAt(now, window))),
                    row.GrantCount,
                    ConnectionTestSummaryMapping.ToDto(newestTest?.LastTest, row.ConnectionSettingsChangedAt),
                    newestTest?.Name.Value,
                    row.Version);
            })
            // Sorted here, not in SQL: names are ASCII DNS labels, so ordinal order is the natural one and does not
            // depend on the database collation.
            .OrderBy(item => item.Name, StringComparer.Ordinal)
            .ToList();

        return Result.Success<IReadOnlyList<ClusterListItemDto>>(items.AsReadOnly());
    }

    /// <summary>
    /// The most severe status (contract §3): expired, expiringSoon, unknown, noExpiry, ok. That is not the enum's
    /// declaration order, hence the explicit ranking.
    /// </summary>
    /// <param name="statuses">The statuses of a cluster's credentials.</param>
    /// <returns>The worst one, or <see langword="null"/> when there are none.</returns>
    internal static CredentialExpiryStatus? Worst(IEnumerable<CredentialExpiryStatus> statuses)
    {
        CredentialExpiryStatus? worst = null;
        foreach (var status in statuses)
        {
            if (worst is null || Severity(status) > Severity(worst.Value))
            {
                worst = status;
            }
        }

        return worst;
    }

    private static int Severity(CredentialExpiryStatus status) => status switch
    {
        CredentialExpiryStatus.Expired => 4,
        CredentialExpiryStatus.ExpiringSoon => 3,
        CredentialExpiryStatus.Unknown => 2,
        CredentialExpiryStatus.NoExpiry => 1,
        CredentialExpiryStatus.Ok => 0,
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, "Unknown credential expiry status."),
    };
}
