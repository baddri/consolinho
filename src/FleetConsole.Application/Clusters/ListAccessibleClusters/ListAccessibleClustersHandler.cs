using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Clusters.ListAccessibleClusters;

/// <summary>
/// Answers <see cref="ListAccessibleClustersQuery"/> with one SQL statement (the user's grants joined with the user and
/// the clusters), then derives the effective mode and sorts in memory.
/// </summary>
/// <remarks>
/// <b>Effective mode:</b> read-only when the grant is, or when the user is globally read-only — according to the session
/// (<see cref="ICurrentUser.IsReadOnly"/>) <em>or</em> the stored user, whichever is stricter, so a read-only change shows
/// up here before the session is revalidated. The proxy (CP2) enforces the same rule; this only informs the UI.
/// </remarks>
/// <param name="readModel">The read model.</param>
/// <param name="currentUser">The signed-in user.</param>
internal sealed class ListAccessibleClustersHandler(IReadModel readModel, ICurrentUser currentUser)
    : IRequestHandler<ListAccessibleClustersQuery, Result<IReadOnlyList<AccessibleClusterDto>>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<AccessibleClusterDto>>> Handle(
        ListAccessibleClustersQuery request, CancellationToken cancellationToken)
    {
        if (currentUser.UserId is not { } userId)
        {
            // AuthorizationBehavior lets only signed-in users through; nothing to list without an id.
            return Result.Success<IReadOnlyList<AccessibleClusterDto>>([]);
        }

        var query =
            from g in readModel.Grants
            where g.UserId == userId
            join u in readModel.Users on g.UserId equals u.Id
            where !u.IsDeactivated
            join c in readModel.Clusters on g.ClusterId equals c.Id
            where c.IsEnabled
            select new { c.Name, c.DisplayName, c.Environment, g.AccessMode, UserIsReadOnly = u.IsReadOnly, c.WebConsoleUrl };
        var rows = await readModel.ToListAsync(query, cancellationToken).ConfigureAwait(false);

        IReadOnlyList<AccessibleClusterDto> clusters =
        [
            .. rows
                .OrderBy(r => r.Environment)
                .ThenBy(r => r.Name.Value, StringComparer.Ordinal)
                .Select(r => new AccessibleClusterDto(
                    r.Name.Value,
                    r.DisplayName,
                    r.Environment,
                    r.UserIsReadOnly || currentUser.IsReadOnly ? AccessMode.ReadOnly : r.AccessMode,
                    r.WebConsoleUrl?.OriginalString)),
        ];
        return Result.Success(clusters);
    }
}
