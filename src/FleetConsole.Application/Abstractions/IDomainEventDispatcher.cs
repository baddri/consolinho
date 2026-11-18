using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Abstractions;

/// <summary>
/// Port that delivers domain events to their handlers (audit, cache invalidation) once the changes that raised them
/// are durable. The <see cref="IUnitOfWork"/> implementation calls it right after a successful save, so a handler never
/// observes an event whose transaction rolled back.
/// </summary>
/// <remarks>
/// Infrastructure currently registers a no-op implementation: no event handlers exist yet. The first feature that
/// reacts to events (audit, CP1+) replaces it with a real dispatcher; nothing that raises events has to change.
/// </remarks>
public interface IDomainEventDispatcher
{
    /// <summary>Delivers <paramref name="domainEvents"/> in the order they were raised.</summary>
    /// <param name="domainEvents">Events collected from the aggregates that were just saved; may be empty.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A task that completes when every event has been handled.</returns>
    Task DispatchAsync(IReadOnlyList<IDomainEvent> domainEvents, CancellationToken cancellationToken);
}
