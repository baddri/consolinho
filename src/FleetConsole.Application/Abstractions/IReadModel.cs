using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Abstractions;

/// <summary>
/// Port through which query handlers read data: no-tracking, read-only <see cref="IQueryable{T}"/>s that handlers
/// filter, join and <b>project straight to DTOs</b>, so queries never load aggregates just to map them
/// (BACKEND.md "Use case folder convention"), plus the async operators that execute such a query. Command handlers use
/// the repositories in <c>Abstractions/Persistence</c> instead.
/// </summary>
/// <remarks>
/// <para><b>No tracking.</b> Every queryable is <c>AsNoTracking()</c>: entities read here are never saved, and changing
/// one has no effect. Never pass them to a repository.</para>
/// <para><b>Executing queries.</b> The Application layer does not reference EF Core, so the async terminal operators
/// (<c>ToListAsync</c>, …) are members of this port: compose with the standard <c>System.Linq</c> operators, then
/// <c>await readModel.ToListAsync(query, ct)</c>. Never enumerate a queryable synchronously (<c>ToList()</c>,
/// <c>foreach</c>): that blocks a thread on database I/O. Pass only queries built from this read model's queryables;
/// in-memory fakes used by handler unit tests execute them with LINQ to Objects.</para>
/// <para><b>Project in SQL.</b> End a query with a <c>Select</c> into a DTO or an anonymous shape, join aggregates by id
/// (<c>from g in Grants join c in Clusters on g.ClusterId equals c.Id</c>) instead of per-row lookups, and never select
/// <see cref="Credential.Token"/>: no query needs the ciphertext.</para>
/// <para><b>Mapped members only.</b> Derived members are not columns and can't be translated in <c>Where</c>,
/// <c>OrderBy</c> or a SQL projection: <see cref="User.Role"/>, <see cref="User.Status"/>,
/// <see cref="User.IsActiveWritableAdmin"/>, <see cref="ApiServerEndpoint.TlsMode"/>, <see cref="CaBundle.Certificates"/>,
/// <see cref="TokenMetadata.ServiceAccount"/> and expiry status. Compute them from the mapped members they derive from
/// (e.g. <c>u.IsAdminByAssignment || u.AdminConfigurationSource != null</c> for the role, ADR-0009), or select the
/// value objects and derive in memory after the query.</para>
/// <para><b>Value objects</b> (<see cref="ClusterName"/>, <see cref="Username"/>, ids, …) are stored as single columns
/// and compared as whole values in predicates (<c>c.Name == name</c>, <c>names.Contains(c.Name)</c>), not through
/// <c>.Value</c>.</para>
/// </remarks>
public interface IReadModel
{
    /// <summary>All users (no tracking).</summary>
    IQueryable<User> Users { get; }

    /// <summary>All registered clusters (no tracking).</summary>
    IQueryable<Cluster> Clusters { get; }

    /// <summary>All credentials of all clusters (no tracking). Project metadata only; the encrypted token is never needed by a query.</summary>
    IQueryable<Credential> Credentials { get; }

    /// <summary>All grants (no tracking).</summary>
    IQueryable<Grant> Grants { get; }

    /// <summary>
    /// The audit log (no tracking). Indexed for newest-first keyset pages (<c>OccurredAt</c> descending, then
    /// <c>Id</c> descending) and for exact filters on <c>Actor.Name</c>, <c>RelatedUsername</c> and <c>ClusterName</c>.
    /// </summary>
    IQueryable<AuditEntry> AuditEntries { get; }

    /// <summary>Executes <paramref name="query"/> and returns all rows.</summary>
    /// <typeparam name="T">The projected row type.</typeparam>
    /// <param name="query">A query composed from this read model's queryables.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The rows, in the query's order.</returns>
    Task<List<T>> ToListAsync<T>(IQueryable<T> query, CancellationToken cancellationToken);

    /// <summary>Executes <paramref name="query"/> and returns its first row, or the default value when there is none.</summary>
    /// <typeparam name="T">The projected row type.</typeparam>
    /// <param name="query">A query composed from this read model's queryables; order it if "first" matters.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The first row, or <see langword="default"/>.</returns>
    Task<T?> FirstOrDefaultAsync<T>(IQueryable<T> query, CancellationToken cancellationToken);

    /// <summary>Counts the rows of <paramref name="query"/> in the database.</summary>
    /// <typeparam name="T">The row type.</typeparam>
    /// <param name="query">A query composed from this read model's queryables.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The number of rows.</returns>
    Task<int> CountAsync<T>(IQueryable<T> query, CancellationToken cancellationToken);

    /// <summary>Whether <paramref name="query"/> returns at least one row.</summary>
    /// <typeparam name="T">The row type.</typeparam>
    /// <param name="query">A query composed from this read model's queryables.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns><see langword="true"/> when a row exists.</returns>
    Task<bool> AnyAsync<T>(IQueryable<T> query, CancellationToken cancellationToken);
}
