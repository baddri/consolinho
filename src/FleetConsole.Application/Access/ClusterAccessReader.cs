using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Access.Resolution;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Application.Access;

/// <summary>
/// Loads what a user can reach — per cluster, the grant that wins under the precedence rules (ADR-0034 §2, PREC-2..8)
/// — in <b>one SQL statement</b>. Shared by the proxy authorization (<c>AuthorizeProxyRequestHandler</c>) and the
/// cluster switcher (<c>ListAccessibleClustersHandler</c>), so both always agree (PREC-8).
/// </summary>
/// <remarks>
/// <para><b>Query.</b> The active user, cross-joined with every grant that names them directly <em>or</em> names one of
/// their groups (<c>group_name = ANY(users.groups)</c>), inner-joined with the enabled cluster and the credential. Each
/// returned row is one candidate grant; a user typically has a handful, so the encrypted token is selected per row and
/// all but the winner's are dropped. Membership is <see cref="User.Groups"/> as recorded at login or revalidation —
/// never a host call (PREC-1, ADR-0019: one statement per authorization).</para>
/// <para><b>Resolution.</b> Rows are grouped by cluster and handed to <see cref="AccessResolver"/> with the stricter of
/// the stored and the session read-only flag (PREC-6). A tie between group grants is logged (PREC-5).</para>
/// <para><b>Not available.</b> A deactivated user, a disabled or unknown cluster, a missing credential and no matching
/// grant all just produce no row for that cluster — callers can't tell them apart (PRX-2, PREC-7).</para>
/// <para>CP4.5b wraps this in <c>ResolveClusterAccessQuery</c> and caches it (ADR-0035); keep it free of side
/// effects other than the tie warning.</para>
/// </remarks>
/// <param name="readModel">The read model.</param>
/// <param name="logger">Receives the tie warning.</param>
internal sealed partial class ClusterAccessReader(IReadModel readModel, ILogger<ClusterAccessReader> logger)
{
    /// <summary>Loads and resolves the user's access to every enabled cluster, or only to <paramref name="cluster"/>.</summary>
    /// <param name="userId">The signed-in user.</param>
    /// <param name="cluster">Only this cluster (the proxy), or all (the switcher) when null.</param>
    /// <param name="sessionIsReadOnly">The session's read-only flag; combined with the stored one, whichever is
    /// stricter, so a read-only change applies before the session is revalidated.</param>
    /// <param name="cancellationToken">Cancels the query.</param>
    /// <returns>One entry per cluster the user can reach (unordered); empty when there is none.</returns>
    public async Task<IReadOnlyList<ResolvedClusterAccess>> LoadAsync(
        UserId userId, ClusterName? cluster, bool sessionIsReadOnly, CancellationToken cancellationToken)
    {
        var clusters = cluster is null
            ? readModel.Clusters.Where(c => c.IsEnabled)
            : readModel.Clusters.Where(c => c.IsEnabled && c.Name == cluster);

        var query =
            from u in readModel.Users
            where u.Id == userId && !u.IsDeactivated
            from g in readModel.Grants
            // The (string) cast is GroupName's explicit operator: EF translates it to the text column, so this becomes
            // "g.group_name = ANY (u.groups)"; in memory (unit tests) it simply returns the value.
            where g.UserId == u.Id
                || (g.SubjectKind == GrantSubjectKind.Group && g.GroupName != null && u.Groups.Contains((string)g.GroupName))
            join c in clusters on g.ClusterId equals c.Id
            join cr in readModel.Credentials on g.CredentialId equals cr.Id
            select new CandidateRow(
                c.Id,
                c.Name,
                c.DisplayName,
                c.Environment,
                c.Distribution,
                c.Endpoint,
                c.WebConsoleUrl,
                u.Username,
                u.IsReadOnly,
                u.Groups,
                g.Id,
                g.GroupName,
                g.Priority,
                g.AccessMode,
                g.CredentialId,
                cr.Name,
                cr.Token);
        var rows = await readModel.ToListAsync(query, cancellationToken).ConfigureAwait(false);

        var result = new List<ResolvedClusterAccess>();
        foreach (var clusterRows in rows.GroupBy(r => r.ClusterId))
        {
            if (Resolve([.. clusterRows], sessionIsReadOnly) is { } access)
            {
                result.Add(access);
            }
        }

        return result;
    }

    private ResolvedClusterAccess? Resolve(IReadOnlyList<CandidateRow> rows, bool sessionIsReadOnly)
    {
        // User columns are the same on every row of the statement.
        var first = rows[0];
        var candidates = rows
            .Select(r => new AccessCandidate(r.GrantId, r.GroupName?.Value, r.Priority, r.AccessMode, r.CredentialId))
            .ToList();
        var resolution = AccessResolver.Resolve(candidates, first.UserGroups, first.UserIsReadOnly || sessionIsReadOnly);
        if (resolution is null)
        {
            return null;
        }

        if (resolution.TieDetected)
        {
            Log.GroupGrantTie(
                logger,
                first.ClusterId.Value,
                resolution.Winner.GrantId.Value,
                string.Join(',', resolution.Verdicts.Select(v => v.Candidate.GrantId.Value)));
        }

        var winner = rows.First(r => r.GrantId == resolution.Winner.GrantId);
        return new ResolvedClusterAccess(
            first.ClusterId,
            first.ClusterName,
            first.ClusterDisplayName,
            first.Environment,
            first.Distribution,
            first.Endpoint,
            first.WebConsoleUrl?.OriginalString,
            first.Username.Value,
            first.UserIsReadOnly,
            resolution,
            winner.Token,
            winner.CredentialName.Value);
    }

    /// <summary>One candidate grant as selected by the statement (cluster, user, grant and credential columns).</summary>
    private sealed record CandidateRow(
        ClusterId ClusterId,
        ClusterName ClusterName,
        string ClusterDisplayName,
        ClusterEnvironment Environment,
        ClusterDistribution Distribution,
        ApiServerEndpoint Endpoint,
        Uri? WebConsoleUrl,
        Username Username,
        bool UserIsReadOnly,
        IReadOnlyList<string> UserGroups,
        GrantId GrantId,
        GroupName? GroupName,
        int? Priority,
        AccessMode AccessMode,
        Domain.Credentials.CredentialId CredentialId,
        Domain.Credentials.CredentialName CredentialName,
        Domain.Credentials.EncryptedToken Token);

    /// <summary>Source-generated log messages; ids only, never names or tokens.</summary>
    private static partial class Log
    {
        [LoggerMessage(EventId = 2600, Level = LogLevel.Warning,
            Message = "Group grants tie on cluster {ClusterId}: grant {WinnerGrantId} wins by the documented tiebreak among {CandidateGrantIds}")]
        public static partial void GroupGrantTie(ILogger logger, Guid clusterId, Guid winnerGrantId, string candidateGrantIds);
    }
}
