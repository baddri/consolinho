using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Access;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Clusters.ListAccessibleClusters;

/// <summary>
/// Answers <see cref="ListAccessibleClustersQuery"/> from <see cref="ClusterAccessReader"/> (one SQL statement; direct
/// and group grants resolved per cluster exactly as the proxy does, PREC-8), sorted in memory.
/// </summary>
/// <remarks>
/// <b>Effective mode:</b> the resolver's — read-only when the winning grant is, or when the user is globally read-only
/// according to the session (<see cref="ICurrentUser.IsReadOnly"/>) <em>or</em> the stored user, whichever is stricter,
/// so a read-only change shows up here before the session is revalidated. The proxy (CP2) enforces the same rule; this only informs the UI.
/// </remarks>
/// <param name="reader">Loads and resolves the user's grants.</param>
/// <param name="currentUser">The signed-in user.</param>
internal sealed class ListAccessibleClustersHandler(ClusterAccessReader reader, ICurrentUser currentUser)
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

        var accesses = await reader.LoadAsync(userId, cluster: null, currentUser.IsReadOnly, cancellationToken).ConfigureAwait(false);

        IReadOnlyList<AccessibleClusterDto> clusters =
        [
            .. accesses
                .OrderBy(a => a.Environment)
                .ThenBy(a => a.ClusterName.Value, StringComparer.Ordinal)
                .Select(a => new AccessibleClusterDto(
                    a.ClusterName.Value,
                    a.ClusterDisplayName,
                    a.Environment,
                    a.Distribution,
                    a.Resolution.EffectiveMode,
                    a.WebConsoleUrl)),
        ];
        return Result.Success(clusters);
    }
}
