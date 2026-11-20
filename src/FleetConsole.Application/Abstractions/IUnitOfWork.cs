namespace FleetConsole.Application.Abstractions;

/// <summary>
/// Port for committing the changes a command made to aggregates loaded through repositories. Called once per command
/// by the <c>UnitOfWorkBehavior</c> after a successful handler — handlers never call it themselves, which keeps
/// "one command = one transaction" true everywhere.
/// </summary>
/// <remarks>
/// <para>Implemented by Infrastructure (the EF Core <c>ConsoleDbContext</c>). Before writing, the implementation hands the
/// domain events raised by the changed aggregates to the <see cref="IDomainEventDispatcher"/>; their handlers stage audit
/// entries in the same unit of work, and everything is written in one transaction (ADR-0008). Events are cleared only
/// after the write succeeded.</para>
/// <para>A failed save leaves the staged changes (including audit entries) tracked; the request's scope, and with it the
/// unit of work, is discarded. Never retry a save on the same unit of work: the events would be dispatched again.</para>
/// </remarks>
public interface IUnitOfWork
{
    /// <summary>
    /// Dispatches the pending domain events to their pre-commit handlers, then persists all pending changes atomically.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A task that completes when the changes are durable.</returns>
    /// <exception cref="Persistence.ConcurrencyConflictException">A commit-time race: stale version, or a concurrent change
    /// or delete (foreign key violation).</exception>
    /// <exception cref="Persistence.DuplicateKeyException">A unique key was taken concurrently.</exception>
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
