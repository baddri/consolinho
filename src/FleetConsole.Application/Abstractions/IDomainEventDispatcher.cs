using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Abstractions;

/// <summary>
/// Port that delivers domain events to their <see cref="IDomainEventHandler{TEvent}"/>s <b>before the write, in the
/// same transaction</b> (ADR-0008). The <see cref="IUnitOfWork"/> implementation calls it with the events of the
/// aggregates it is about to save; handlers stage further changes (audit entries) in the same unit of work, which are
/// then written together with the aggregates. If the write fails, nothing the handlers staged is persisted either.
/// </summary>
/// <remarks>
/// Implemented by Infrastructure (<c>DomainEventDispatcher</c>), which resolves the handlers from the current DI scope,
/// so they share the request's unit of work and current user. Post-commit side effects (cache invalidation) are a
/// separate, future stage and must not be handled through this port (ADR-0008 §6).
/// </remarks>
public interface IDomainEventDispatcher
{
    /// <summary>Delivers <paramref name="domainEvents"/> in the order given, awaiting every handler of each event.</summary>
    /// <param name="domainEvents">Events collected from the aggregates about to be saved; may be empty.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A task that completes when every event has been handled. A handler's exception propagates and aborts
    /// the save.</returns>
    Task DispatchAsync(IReadOnlyList<IDomainEvent> domainEvents, CancellationToken cancellationToken);
}
