using FleetConsole.Domain.Common;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace FleetConsole.Infrastructure.Persistence;

/// <summary>
/// Snapshot of the tracked aggregates that have raised domain events, taken <em>before</em> a save and released
/// (events read and cleared) only after the save succeeded. Used by <see cref="ConsoleDbContext"/>.
/// </summary>
/// <remarks>
/// The snapshot has to be taken before saving: aggregates deleted by the save are detached afterwards and would no
/// longer be visible through the change tracker, so their events (e.g. "user deleted") would be lost.
/// If the save throws, <see cref="TakeEvents"/> is never called and the events stay on the aggregates.
/// </remarks>
internal sealed class PendingDomainEvents
{
    private readonly List<IHasDomainEvents> _aggregates;

    private PendingDomainEvents(List<IHasDomainEvents> aggregates) => _aggregates = aggregates;

    /// <summary>Records which tracked aggregates currently have pending events.</summary>
    /// <param name="changeTracker">The context's change tracker.</param>
    /// <returns>The snapshot; cheap when nothing raised events.</returns>
    public static PendingDomainEvents Capture(ChangeTracker changeTracker) =>
        new(changeTracker.Entries<IHasDomainEvents>()
            .Select(entry => entry.Entity)
            .Where(aggregate => aggregate.DomainEvents.Count > 0)
            .ToList());

    /// <summary>Returns the captured aggregates' events (aggregate by aggregate, each in raise order) and clears them.</summary>
    /// <returns>The events to dispatch; empty when none were raised.</returns>
    public IReadOnlyList<IDomainEvent> TakeEvents()
    {
        var events = _aggregates.SelectMany(aggregate => aggregate.DomainEvents).ToList();
        foreach (var aggregate in _aggregates)
        {
            aggregate.ClearDomainEvents();
        }

        return events;
    }
}
