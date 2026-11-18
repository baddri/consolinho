using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Common;

namespace FleetConsole.Infrastructure.Events;

/// <summary>
/// <see cref="IDomainEventDispatcher"/> that drops events. Correct for now because no domain event handlers exist; the
/// first event-driven feature (audit, CP1+) replaces this registration with a real dispatcher.
/// </summary>
internal sealed class NoOpDomainEventDispatcher : IDomainEventDispatcher
{
    /// <inheritdoc />
    public Task DispatchAsync(IReadOnlyList<IDomainEvent> domainEvents, CancellationToken cancellationToken) => Task.CompletedTask;
}
