using FleetConsole.Domain.Clusters;

namespace FleetConsole.Application.Abstractions.Persistence;

/// <summary>
/// Write-side access to <see cref="Cluster"/> aggregates for command handlers. Changes are committed by
/// <c>UnitOfWorkBehavior</c>; queries read through <see cref="IReadModel"/>.
/// </summary>
public interface IClusterRepository
{
    /// <summary>Loads a cluster by id for modification.</summary>
    /// <param name="id">The cluster id.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The tracked cluster, or <see langword="null"/>.</returns>
    Task<Cluster?> GetByIdAsync(ClusterId id, CancellationToken cancellationToken);

    /// <summary>Loads a cluster by its natural key (the URL slug) for modification.</summary>
    /// <param name="name">The cluster name.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The tracked cluster, or <see langword="null"/>.</returns>
    Task<Cluster?> GetByNameAsync(ClusterName name, CancellationToken cancellationToken);

    /// <summary>
    /// Loads several clusters by name in one query (bulk grant, GRANT-4). Unknown names are simply absent from the
    /// result, so the caller can report them per item.
    /// </summary>
    /// <param name="names">The names to look up.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The tracked clusters that exist, in no particular order.</returns>
    Task<IReadOnlyList<Cluster>> GetByNamesAsync(IReadOnlyCollection<ClusterName> names, CancellationToken cancellationToken);

    /// <summary>
    /// Whether a cluster with this name exists. A friendly pre-check for registration; the unique index on
    /// <c>clusters.name</c> still catches races (<see cref="DuplicateKeyException"/>).
    /// </summary>
    /// <param name="name">The cluster name.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns><see langword="true"/> when the name is taken.</returns>
    Task<bool> ExistsAsync(ClusterName name, CancellationToken cancellationToken);

    /// <summary>Stages a newly registered cluster for insertion at commit.</summary>
    /// <param name="cluster">The new cluster.</param>
    void Add(Cluster cluster);

    /// <summary>
    /// Stages the deletion of a cluster (CLU-6, after <see cref="Cluster.MarkForDeletion"/> succeeded). The database
    /// cascades to the cluster's credentials and grants in the same statement.
    /// </summary>
    /// <param name="cluster">The tracked cluster to delete.</param>
    void Remove(Cluster cluster);
}
