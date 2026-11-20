using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace FleetConsole.Infrastructure.Persistence.Repositories;

/// <summary>EF Core implementation of <see cref="IGrantRepository"/> over the request's <see cref="ConsoleDbContext"/>.</summary>
/// <param name="db">The scoped context, shared with the unit of work.</param>
internal sealed class GrantRepository(ConsoleDbContext db) : IGrantRepository
{
    /// <inheritdoc />
    public Task<Grant?> GetByIdAsync(GrantId id, CancellationToken cancellationToken) =>
        db.Set<Grant>().SingleOrDefaultAsync(g => g.Id == id, cancellationToken);

    /// <inheritdoc />
    public async Task<IReadOnlySet<ClusterId>> GetClusterIdsForUserAsync(UserId userId, CancellationToken cancellationToken)
    {
        var clusterIds = await db.Set<Grant>()
            .Where(g => g.UserId == userId)
            .Select(g => g.ClusterId)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        return clusterIds.ToHashSet();
    }

    /// <inheritdoc />
    public Task<int> CountByCredentialAsync(CredentialId id, CancellationToken cancellationToken) =>
        db.Set<Grant>().CountAsync(g => g.CredentialId == id, cancellationToken);

    /// <inheritdoc />
    public async Task<GrantModeCounts> CountByModeAsync(CredentialId id, CancellationToken cancellationToken)
    {
        // One GROUP BY access_mode statement, untracked: only the numbers are needed, not the aggregates.
        var counts = await db.Set<Grant>()
            .AsNoTracking()
            .Where(g => g.CredentialId == id)
            .GroupBy(g => g.AccessMode)
            .Select(group => new { Mode = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        int CountOf(AccessMode mode) => counts.Where(c => c.Mode == mode).Sum(c => c.Count);
        return new GrantModeCounts(CountOf(AccessMode.ReadOnly), CountOf(AccessMode.ReadWrite));
    }

    /// <inheritdoc />
    public Task<int> CountByClusterAsync(ClusterId id, CancellationToken cancellationToken) =>
        db.Set<Grant>().CountAsync(g => g.ClusterId == id, cancellationToken);

    /// <inheritdoc />
    public void Add(Grant grant) => db.Set<Grant>().Add(grant);

    /// <inheritdoc />
    public void Remove(Grant grant) => db.Set<Grant>().Remove(grant);
}
