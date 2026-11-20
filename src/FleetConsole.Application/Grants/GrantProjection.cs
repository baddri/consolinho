using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Common;
using FleetConsole.Application.Credentials;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Grants;

/// <summary>
/// Reads <see cref="GrantDto"/>s from the read model for every grant query (per user, per cluster, by id), so all views
/// report the same fields and markers (GRANT-5).
/// </summary>
/// <remarks>
/// <para><b>One statement, whatever the number of rows:</b> grants joined with their user, cluster and credential. No
/// per-row lookups (no N+1).</para>
/// <para><b>Never the token.</b> Only credential metadata columns are selected (CRED-2).</para>
/// <para><b>Derived values in memory.</b> The credential's expiry status (against <see cref="IClock"/> and
/// <c>Credentials:ExpiryWarningDays</c>) and the test summary's staleness are not columns, so they are computed after
/// the SQL projection. Rows come back unordered; callers sort.</para>
/// </remarks>
internal static class GrantProjection
{
    /// <summary>
    /// Resolves the <c>{username}</c> route value of a grant query to the user's id. A value that isn't even a valid
    /// username can't exist, so it is <c>Users.NotFound</c> too (unknown route ids are 404s, ADR-0013 §8).
    /// </summary>
    /// <param name="readModel">The read model.</param>
    /// <param name="username">The username from the route.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The user id, or <c>Users.NotFound</c>.</returns>
    public static async Task<Result<UserId>> FindUserIdAsync(IReadModel readModel, string username, CancellationToken cancellationToken)
    {
        var name = Username.Create(username);
        if (name.IsFailure)
        {
            return UserErrors.NotFound(username);
        }

        var query = readModel.Users.Where(u => u.Username == name.Value).Select(u => (UserId?)u.Id);
        var id = await readModel.FirstOrDefaultAsync(query, cancellationToken).ConfigureAwait(false);
        return id is { } found ? found : UserErrors.NotFound(username);
    }

    /// <summary>Loads the given grants as DTOs.</summary>
    /// <param name="readModel">The read model.</param>
    /// <param name="grants">The grants to load, already filtered (by user, cluster or ids).</param>
    /// <param name="now">The current time, for the credential's expiry status.</param>
    /// <param name="options">The credential settings (expiry warning window).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The DTOs, in no particular order.</returns>
    public static async Task<List<GrantDto>> LoadAsync(
        IReadModel readModel,
        IQueryable<Grant> grants,
        DateTimeOffset now,
        CredentialsOptions options,
        CancellationToken cancellationToken)
    {
        var rowQuery =
            from g in grants
            join u in readModel.Users on g.UserId equals u.Id
            join c in readModel.Clusters on g.ClusterId equals c.Id
            join cr in readModel.Credentials on g.CredentialId equals cr.Id
            select new
            {
                g.Id,
                u.Username,
                UserDisplayName = u.DisplayName,

                // User.Status is not a column; same precedence as the aggregate (deactivated, then pending, then active).
                UserStatus = u.IsDeactivated
                    ? UserStatus.Deactivated
                    : u.LastLoginAt == null ? UserStatus.Pending : UserStatus.Active,
                ClusterName = c.Name,
                ClusterDisplayName = c.DisplayName,
                ClusterEnvironment = c.Environment,
                ClusterIsEnabled = c.IsEnabled,
                c.ConnectionSettingsChangedAt,
                CredentialId = cr.Id,
                CredentialName = cr.Name,
                cr.Metadata,
                cr.LastTest,
                g.AccessMode,
                g.GrantedAt,
                g.GrantedBy,
                g.UpdatedAt,
                g.UpdatedBy,
                g.Version,
            };
        var rows = await readModel.ToListAsync(rowQuery, cancellationToken).ConfigureAwait(false);

        var window = options.ExpiryWarningWindow;
        return rows.ConvertAll(row => new GrantDto(
            row.Id.Value,
            row.Username.Value,
            row.UserDisplayName,
            row.UserStatus,
            row.ClusterName.Value,
            row.ClusterDisplayName,
            row.ClusterEnvironment,
            row.ClusterIsEnabled,
            row.CredentialId.Value,
            row.CredentialName.Value,
            row.Metadata.StatusAt(now, window),
            row.Metadata.ExpiresAt,
            ConnectionTestSummaryMapping.ToDto(row.LastTest, row.ConnectionSettingsChangedAt),
            row.AccessMode,
            row.GrantedAt,
            row.GrantedBy,
            row.UpdatedAt,
            row.UpdatedBy,
            row.Version));
    }
}
