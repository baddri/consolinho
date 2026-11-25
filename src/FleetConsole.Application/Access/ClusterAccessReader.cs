using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Access.LoadAccessSnapshot;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Access.Resolution;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Application.Access;

/// <summary>
/// Resolves what a user can reach — per cluster, the grant that wins under the precedence rules (ADR-0034 §2,
/// PREC-2..8) — from the user's cached <see cref="AccessSnapshot"/>. Shared by the proxy authorization
/// (<c>AuthorizeProxyRequestHandler</c>) and the cluster switcher (<c>ListAccessibleClustersHandler</c>), so both always
/// agree (PREC-8); the admin Effective access view (<c>GetEffectiveAccessHandler</c>, EFF-1..5) explains the same result.
/// </summary>
/// <remarks>
/// <para><b>Load.</b> Sends <see cref="LoadAccessSnapshotQuery"/> through the dispatcher, so the caching behavior serves
/// it (ADR-0040 §4): a hit costs no SQL, a miss is the one statement of <see cref="LoadAccessSnapshotHandler"/>.
/// Membership is <see cref="User.Groups"/> as recorded at login or revalidation — never a host call (PREC-1).</para>
/// <para><b>Resolution, per request.</b> Rows of disabled clusters (and of other clusters when one is named) are dropped,
/// the rest grouped by cluster and handed to <see cref="AccessResolver"/> with the stricter of the stored and the
/// session read-only flag (PREC-6). Doing this on every request, not in the cached value, keeps the session flag out of
/// the cache key. A tie between group grants is logged (PREC-5).</para>
/// <para><b>Not available.</b> A deactivated user, a disabled or unknown cluster, a missing credential and no matching
/// grant all just produce no entry for that cluster — callers can't tell them apart (PRX-2, PREC-7).</para>
/// <para>Keep it free of side effects other than the tie warning.</para>
/// </remarks>
/// <param name="dispatcher">Sends the (cached) snapshot query.</param>
/// <param name="logger">Receives the tie warning.</param>
internal sealed partial class ClusterAccessReader(IDispatcher dispatcher, ILogger<ClusterAccessReader> logger)
{
    /// <summary>Resolves the user's access to every enabled cluster, or only to <paramref name="cluster"/>.</summary>
    /// <param name="userId">The signed-in user.</param>
    /// <param name="cluster">Only this cluster (the proxy), or all (the switcher) when null.</param>
    /// <param name="sessionIsReadOnly">The session's read-only flag; combined with the stored one, whichever is
    /// stricter, so a read-only change applies before the session is revalidated.</param>
    /// <param name="cancellationToken">Cancels the load.</param>
    /// <returns>One entry per cluster the user can reach (unordered); empty when there is none.</returns>
    public async Task<IReadOnlyList<ResolvedClusterAccess>> LoadAsync(
        UserId userId, ClusterName? cluster, bool sessionIsReadOnly, CancellationToken cancellationToken)
    {
        var loaded = await dispatcher.Send(new LoadAccessSnapshotQuery(userId), cancellationToken).ConfigureAwait(false);

        // The handler has no failure path; a failure here is a bug, not "no access".
        var snapshot = loaded.IsSuccess
            ? loaded.Value
            : throw new InvalidOperationException($"Loading the access snapshot failed: {loaded.Error.Code}.");

        var result = new List<ResolvedClusterAccess>();
        var rows = snapshot.Rows.Where(r => r.ClusterIsEnabled
            && (cluster is null || string.Equals(r.ClusterName, cluster.Value, StringComparison.Ordinal)));
        foreach (var clusterRows in rows.GroupBy(r => r.ClusterId))
        {
            if (Resolve(snapshot, [.. clusterRows], sessionIsReadOnly) is { } access)
            {
                result.Add(access);
            }
        }

        return result;
    }

    private ResolvedClusterAccess? Resolve(AccessSnapshot snapshot, IReadOnlyList<AccessSnapshotRow> rows, bool sessionIsReadOnly)
    {
        var candidates = rows
            .Select(r => new AccessCandidate(
                new GrantId(r.GrantId),
                r.GroupName,
                r.Priority,
                Enum.Parse<AccessMode>(r.AccessMode),
                new CredentialId(r.CredentialId)))
            .ToList();
        var resolution = AccessResolver.Resolve(candidates, snapshot.UserGroups, snapshot.UserIsReadOnly || sessionIsReadOnly);
        if (resolution is null)
        {
            return null;
        }

        // Cluster columns are the same on every row of the group.
        var first = rows[0];
        if (resolution.TieDetected)
        {
            Log.GroupGrantTie(
                logger,
                first.ClusterId,
                resolution.Winner.GrantId.Value,
                string.Join(',', resolution.Verdicts.Select(v => v.Candidate.GrantId.Value)));
        }

        var winner = rows.First(r => r.GrantId == resolution.Winner.GrantId.Value);
        return new ResolvedClusterAccess(
            new ClusterId(first.ClusterId),
            // Stored names were validated on write, so re-creating them cannot fail.
            ClusterName.Create(first.ClusterName).Value,
            first.ClusterDisplayName,
            Enum.Parse<ClusterEnvironment>(first.Environment),
            Enum.Parse<ClusterDistribution>(first.Distribution),
            // A ClusterConnection, not ApiServerEndpoint: rebuilding the endpoint would re-parse the CA PEM per request.
            new ClusterConnection(new Uri(first.ApiUrl), first.CaBundlePem, first.SkipTlsVerify),
            first.WebConsoleUrl,
            snapshot.Username,
            snapshot.UserIsReadOnly,
            resolution,
            new EncryptedToken(winner.EncryptedToken),
            winner.CredentialName,
            // From the winning row only: a losing candidate's credential must never leak its namespaces (NSA-1).
            winner.InspectNamespaces,
            rows.ToDictionary(r => new GrantId(r.GrantId), r => r.CredentialName));
    }

    /// <summary>Source-generated log messages; ids only, never names or tokens.</summary>
    private static partial class Log
    {
        [LoggerMessage(EventId = 2600, Level = LogLevel.Warning,
            Message = "Group grants tie on cluster {ClusterId}: grant {WinnerGrantId} wins by the documented tiebreak among {CandidateGrantIds}")]
        public static partial void GroupGrantTie(ILogger logger, Guid clusterId, Guid winnerGrantId, string candidateGrantIds);
    }
}
