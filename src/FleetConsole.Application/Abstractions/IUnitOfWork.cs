namespace FleetConsole.Application.Abstractions;

/// <summary>
/// Port for committing the changes a command made to aggregates loaded through repositories. Called once per command
/// by the <c>UnitOfWorkBehavior</c> after a successful handler — handlers never call it themselves, which keeps
/// "one command = one transaction" true everywhere.
/// </summary>
/// <remarks>
/// Implemented by Infrastructure (the EF Core <c>ConsoleDbContext</c>, T-0004). The implementation also dispatches the
/// domain events collected on saved aggregates after the save succeeds.
/// </remarks>
public interface IUnitOfWork
{
    /// <summary>Persists all pending changes atomically, then dispatches the domain events raised by the changed aggregates.</summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A task that completes when the changes are durable.</returns>
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
