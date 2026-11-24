using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Abstractions;

/// <summary>
/// Port that delivers domain events to their handlers in two stages: to the <see cref="IDomainEventHandler{TEvent}"/>s
/// <b>before the write, in the same transaction</b> (ADR-0008), and to the
/// <see cref="IPostCommitDomainEventHandler{TEvent}"/>s <b>after the commit</b> (ADR-0040 §1). The <see cref="IUnitOfWork"/> implementation calls it with the events of the
/// aggregates it is about to save; handlers stage further changes (audit entries) in the same unit of work, which are
/// then written together with the aggregates. If the write fails, nothing the handlers staged is persisted either.
/// </summary>
/// <remarks>
/// Implemented by Infrastructure (<c>DomainEventDispatcher</c>), which resolves the handlers from the current DI scope,
/// so they share the request's unit of work and current user. Post-commit side effects (cache invalidation) must not
/// run in the pre-commit stage (ADR-0008 §6): they go through <see cref="DispatchPostCommitAsync"/>, which the unit of
/// work calls only once the write succeeded.
/// </remarks>
public interface IDomainEventDispatcher
{
    /// <summary>Delivers <paramref name="domainEvents"/> in the order given, awaiting every handler of each event.</summary>
    /// <param name="domainEvents">Events collected from the aggregates about to be saved; may be empty.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A task that completes when every event has been handled. A handler's exception propagates and aborts
    /// the save.</returns>
    Task DispatchAsync(IReadOnlyList<IDomainEvent> domainEvents, CancellationToken cancellationToken);

    /// <summary>
    /// Delivers <paramref name="domainEvents"/>, whose changes are committed, to every
    /// <see cref="IPostCommitDomainEventHandler{TEvent}"/> of each event, in the order given, one handler after the other.
    /// </summary>
    /// <param name="domainEvents">The events captured for the save that just committed; may be empty.</param>
    /// <param name="cancellationToken">Passed to the handlers; the unit of work passes <see cref="CancellationToken.None"/>
    /// because the commit happened and an aborted client must not skip the side effects.</param>
    /// <returns>A task that completes when every handler ran. It never faults because of a handler: handler exceptions
    /// (cancellation included) are logged as Warnings and swallowed (at-most-once, best effort).</returns>
    Task DispatchPostCommitAsync(IReadOnlyList<IDomainEvent> domainEvents, CancellationToken cancellationToken);
}
