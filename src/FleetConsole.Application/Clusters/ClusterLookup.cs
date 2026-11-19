using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Clusters;

/// <summary>Loads the cluster a command's route names, with the version check edits and transitions share.</summary>
internal static class ClusterLookup
{
    /// <summary>
    /// Loads the cluster for modification. A route name that is not a valid cluster name can't exist, so it is
    /// <c>Clusters.NotFound</c> (404) like an unknown one, never a field error.
    /// </summary>
    /// <param name="clusters">The repository.</param>
    /// <param name="name">The name from the route.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The tracked cluster, or <c>Clusters.NotFound</c>.</returns>
    public static async Task<Result<Cluster>> FindAsync(IClusterRepository clusters, string name, CancellationToken cancellationToken)
    {
        var clusterName = ClusterName.Create(name);
        if (clusterName.IsFailure)
        {
            return ClusterErrors.NotFound(name);
        }

        var cluster = await clusters.GetByNameAsync(clusterName.Value, cancellationToken).ConfigureAwait(false);
        if (cluster is null)
        {
            return ClusterErrors.NotFound(clusterName.Value.Value);
        }

        return cluster;
    }

    /// <summary>
    /// Loads the cluster and checks that the client saw its current version (ADR-0013 §4). A change between this read
    /// and the commit is caught by the <c>xmin</c> check at save time (same 409 code).
    /// </summary>
    /// <param name="clusters">The repository.</param>
    /// <param name="name">The name from the route.</param>
    /// <param name="version">The <c>version</c> the client sent.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The tracked cluster, <c>Clusters.NotFound</c>, or <see cref="ClusterAdminErrors.StaleVersion"/>.</returns>
    public static async Task<Result<Cluster>> FindAtVersionAsync(
        IClusterRepository clusters, string name, uint version, CancellationToken cancellationToken)
    {
        var cluster = await FindAsync(clusters, name, cancellationToken).ConfigureAwait(false);
        if (cluster.IsSuccess && cluster.Value.Version != version)
        {
            return ClusterAdminErrors.StaleVersion;
        }

        return cluster;
    }
}
