using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Clusters;
using Microsoft.EntityFrameworkCore;

namespace FleetConsole.Infrastructure.Persistence.Repositories;

/// <summary>EF Core implementation of <see cref="IClusterRepository"/> over the request's <see cref="ConsoleDbContext"/>.</summary>
/// <param name="db">The scoped context, shared with the unit of work.</param>
internal sealed class ClusterRepository(ConsoleDbContext db) : IClusterRepository
{
    /// <inheritdoc />
    public Task<Cluster?> GetByIdAsync(ClusterId id, CancellationToken cancellationToken) =>
        db.Set<Cluster>().SingleOrDefaultAsync(c => c.Id == id, cancellationToken);

    /// <inheritdoc />
    public Task<Cluster?> GetByNameAsync(ClusterName name, CancellationToken cancellationToken) =>
        db.Set<Cluster>().SingleOrDefaultAsync(c => c.Name == name, cancellationToken);

    /// <inheritdoc />
    public async Task<IReadOnlyList<Cluster>> GetByNamesAsync(IReadOnlyCollection<ClusterName> names, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(names);
        if (names.Count == 0)
        {
            return [];
        }

        // One query (name = ANY(@names)); the parameter elements are converted like the column.
        return await db.Set<Cluster>().Where(c => names.Contains(c.Name)).ToListAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public Task<bool> ExistsAsync(ClusterName name, CancellationToken cancellationToken) =>
        db.Set<Cluster>().AnyAsync(c => c.Name == name, cancellationToken);

    /// <inheritdoc />
    public void Add(Cluster cluster) => db.Set<Cluster>().Add(cluster);

    /// <inheritdoc />
    public void Remove(Cluster cluster) => db.Set<Cluster>().Remove(cluster);
}
