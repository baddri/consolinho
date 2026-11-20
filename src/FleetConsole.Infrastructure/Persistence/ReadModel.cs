using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace FleetConsole.Infrastructure.Persistence;

/// <summary>
/// EF Core implementation of <see cref="IReadModel"/>: <c>AsNoTracking()</c> queryables over the request's
/// <see cref="ConsoleDbContext"/>, and the EF Core async operators that execute queries built from them.
/// </summary>
/// <param name="db">The scoped context.</param>
internal sealed class ReadModel(ConsoleDbContext db) : IReadModel
{
    /// <inheritdoc />
    public IQueryable<User> Users => db.Set<User>().AsNoTracking();

    /// <inheritdoc />
    public IQueryable<Cluster> Clusters => db.Set<Cluster>().AsNoTracking();

    /// <inheritdoc />
    public IQueryable<Credential> Credentials => db.Set<Credential>().AsNoTracking();

    /// <inheritdoc />
    public IQueryable<Grant> Grants => db.Set<Grant>().AsNoTracking();

    /// <inheritdoc />
    public IQueryable<AuditEntry> AuditEntries => db.Set<AuditEntry>().AsNoTracking();

    /// <inheritdoc />
    public Task<List<T>> ToListAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) =>
        EntityFrameworkQueryableExtensions.ToListAsync(query, cancellationToken);

    /// <inheritdoc />
    public Task<T?> FirstOrDefaultAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) =>
        EntityFrameworkQueryableExtensions.FirstOrDefaultAsync(query, cancellationToken);

    /// <inheritdoc />
    public Task<int> CountAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) =>
        EntityFrameworkQueryableExtensions.CountAsync(query, cancellationToken);

    /// <inheritdoc />
    public Task<bool> AnyAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) =>
        EntityFrameworkQueryableExtensions.AnyAsync(query, cancellationToken);
}
