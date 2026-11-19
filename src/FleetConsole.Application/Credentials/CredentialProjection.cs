using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Common;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Credentials;

/// <summary>
/// Reads <see cref="CredentialDto"/>s from the read model for the credential queries (fleet list, per-cluster list,
/// single credential), so every view reports the same fields, expiry status and grant counts.
/// </summary>
/// <remarks>
/// <para><b>Two queries, whatever the number of rows:</b> credentials joined with their cluster, then the grant
/// counts grouped by credential. No per-row lookups (no N+1).</para>
/// <para><b>Never the token.</b> The projection selects metadata columns only; the encrypted token is not read
/// (IReadModel rule, CRED-2).</para>
/// <para><b>Derived values in memory.</b> The service account, expiry status (against <see cref="IClock"/> and
/// <c>Credentials:ExpiryWarningDays</c>, CRED-4) and the test summary's staleness (CLU-4) are not columns, so they are
/// computed after the SQL projection. Rows come back unordered; callers sort.</para>
/// </remarks>
internal static class CredentialProjection
{
    /// <summary>
    /// Resolves the <c>{name}</c> route value of a credential query to the cluster's id. A name that isn't even a valid
    /// cluster name can't exist, so it is <c>Clusters.NotFound</c> too (unknown route ids are 404s, ADR-0013 §8).
    /// </summary>
    /// <param name="readModel">The read model.</param>
    /// <param name="clusterName">The cluster name from the route.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The cluster id, or <c>Clusters.NotFound</c>.</returns>
    public static async Task<Result<ClusterId>> FindClusterIdAsync(
        IReadModel readModel, string clusterName, CancellationToken cancellationToken)
    {
        var name = ClusterName.Create(clusterName);
        if (name.IsFailure)
        {
            return ClusterErrors.NotFound(clusterName);
        }

        var query = readModel.Clusters.Where(c => c.Name == name.Value).Select(c => (ClusterId?)c.Id);
        var id = await readModel.FirstOrDefaultAsync(query, cancellationToken).ConfigureAwait(false);
        return id is { } found ? found : ClusterErrors.NotFound(clusterName);
    }

    /// <summary>Loads the credentials matching the filters (both optional; none = the whole fleet).</summary>
    /// <param name="readModel">The read model.</param>
    /// <param name="clusterId">Only credentials of this cluster.</param>
    /// <param name="credentialId">Only this credential.</param>
    /// <param name="now">The current time, for the expiry status.</param>
    /// <param name="options">The credential settings (expiry warning window).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The DTOs, in no particular order.</returns>
    public static async Task<List<CredentialDto>> LoadAsync(
        IReadModel readModel,
        ClusterId? clusterId,
        CredentialId? credentialId,
        DateTimeOffset now,
        CredentialsOptions options,
        CancellationToken cancellationToken)
    {
        var credentials = readModel.Credentials;
        var grants = readModel.Grants;
        if (clusterId is { } cluster)
        {
            credentials = credentials.Where(cr => cr.ClusterId == cluster);
            grants = grants.Where(g => g.ClusterId == cluster);
        }

        if (credentialId is { } id)
        {
            credentials = credentials.Where(cr => cr.Id == id);
            grants = grants.Where(g => g.CredentialId == id);
        }

        var rowQuery =
            from cr in credentials
            join c in readModel.Clusters on cr.ClusterId equals c.Id
            select new
            {
                cr.Id,
                ClusterName = c.Name,
                ClusterDisplayName = c.DisplayName,
                ClusterEnvironment = c.Environment,
                ClusterIsEnabled = c.IsEnabled,
                c.ConnectionSettingsChangedAt,
                cr.Name,
                cr.Description,
                cr.Fingerprint,
                cr.Metadata,
                cr.CreatedAt,
                cr.CreatedBy,
                cr.RotatedAt,
                cr.RotatedBy,
                cr.LastTest,
                cr.Version,
            };
        var rows = await readModel.ToListAsync(rowQuery, cancellationToken).ConfigureAwait(false);
        if (rows.Count == 0)
        {
            return [];
        }

        var countQuery = grants
            .GroupBy(g => g.CredentialId)
            .Select(group => new
            {
                CredentialId = group.Key,
                Total = group.Count(),
                ReadWrite = group.Count(g => g.AccessMode == AccessMode.ReadWrite),
            });
        var counts = (await readModel.ToListAsync(countQuery, cancellationToken).ConfigureAwait(false))
            .ToDictionary(count => count.CredentialId);

        var window = options.ExpiryWarningWindow;
        return rows.ConvertAll(row =>
        {
            counts.TryGetValue(row.Id, out var count);
            return new CredentialDto(
                row.Id.Value,
                row.ClusterName.Value,
                row.ClusterDisplayName,
                row.ClusterEnvironment,
                row.ClusterIsEnabled,
                row.Name.Value,
                row.Description,
                row.Fingerprint.Value,
                row.Metadata.Type,
                row.Metadata.ServiceAccount,
                row.Metadata.Subject,
                row.Metadata.IssuedAt,
                row.Metadata.ExpiresAt,
                row.Metadata.StatusAt(now, window),
                options.ExpiryWarningDays,
                row.CreatedAt,
                row.CreatedBy,
                row.RotatedAt,
                row.RotatedBy,
                ConnectionTestSummaryMapping.ToDto(row.LastTest, row.ConnectionSettingsChangedAt),
                count?.Total ?? 0,
                count?.ReadWrite ?? 0,
                row.Version);
        });
    }
}
