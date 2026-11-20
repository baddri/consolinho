using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using Microsoft.EntityFrameworkCore;

namespace FleetConsole.Infrastructure.Persistence.Repositories;

/// <summary>EF Core implementation of <see cref="ICredentialRepository"/> over the request's <see cref="ConsoleDbContext"/>.</summary>
/// <param name="db">The scoped context, shared with the unit of work.</param>
internal sealed class CredentialRepository(ConsoleDbContext db) : ICredentialRepository
{
    /// <inheritdoc />
    public Task<Credential?> GetByIdAsync(CredentialId id, CancellationToken cancellationToken) =>
        db.Set<Credential>().SingleOrDefaultAsync(c => c.Id == id, cancellationToken);

    /// <inheritdoc />
    public async Task<IReadOnlyList<Credential>> GetByIdsAsync(IReadOnlyCollection<CredentialId> ids, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(ids);
        if (ids.Count == 0)
        {
            return [];
        }

        return await db.Set<Credential>().Where(c => ids.Contains(c.Id)).ToListAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public Task<bool> NameExistsAsync(ClusterId clusterId, CredentialName name, CancellationToken cancellationToken) =>
        db.Set<Credential>().AnyAsync(c => c.ClusterId == clusterId && c.Name == name, cancellationToken);

    /// <inheritdoc />
    public Task<int> CountByClusterAsync(ClusterId clusterId, CancellationToken cancellationToken) =>
        db.Set<Credential>().CountAsync(c => c.ClusterId == clusterId, cancellationToken);

    /// <inheritdoc />
    public void Add(Credential credential) => db.Set<Credential>().Add(credential);

    /// <inheritdoc />
    public void Remove(Credential credential) => db.Set<Credential>().Remove(credential);
}
