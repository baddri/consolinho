using FleetConsole.Domain.Common;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace FleetConsole.Infrastructure.Persistence;

/// <summary>
/// Snapshot of the tracked aggregates that have raised domain events, taken at the start of a save. The events are
/// dispatched to the pre-commit handlers (ADR-0008) and cleared from the aggregates only after the write succeeded.
/// Used by <see cref="ConsoleDbContext"/>.
/// </summary>
/// <remarks>
/// <para>The snapshot is taken before saving: aggregates deleted by the save are detached afterwards and would no longer
/// be visible through the change tracker, so their events couldn't be cleared.</para>
/// <para>It also remembers how many events each aggregate had, so <see cref="EnsureNoEventsRaisedSince"/> can detect a
/// handler that raised a new event (forbidden: no cascades).</para>
/// <para>If the save throws, <see cref="Clear"/> is never called and the events stay on the aggregates.</para>
/// </remarks>
internal sealed class PendingDomainEvents
{
    private readonly List<IHasDomainEvents> _aggregates;
    private readonly Dictionary<IHasDomainEvents, int> _eventCounts;

    private PendingDomainEvents(List<IHasDomainEvents> aggregates)
    {
        _aggregates = aggregates;
        _eventCounts = new Dictionary<IHasDomainEvents, int>(ReferenceEqualityComparer.Instance);
        foreach (var aggregate in aggregates)
        {
            _eventCounts[aggregate] = aggregate.DomainEvents.Count;
        }

        Events = aggregates.SelectMany(aggregate => aggregate.DomainEvents).ToList();
    }

    /// <summary>The captured events, aggregate by aggregate, each in raise order; empty when none were raised.</summary>
    public IReadOnlyList<IDomainEvent> Events { get; }

    /// <summary>Records which tracked aggregates currently have pending events, and their events.</summary>
    /// <param name="changeTracker">The context's change tracker.</param>
    /// <returns>The snapshot; cheap when nothing raised events.</returns>
    public static PendingDomainEvents Capture(ChangeTracker changeTracker) =>
        new(changeTracker.Entries<IHasDomainEvents>()
            .Select(entry => entry.Entity)
            .Where(aggregate => aggregate.DomainEvents.Count > 0)
            .ToList());

    /// <summary>
    /// Throws if any tracked aggregate has more pending events than at <see cref="Capture"/>: an event handler raised a
    /// new event, which ADR-0008 forbids (it would not be dispatched, so it would not be audited).
    /// </summary>
    /// <param name="changeTracker">The context's change tracker, after dispatch.</param>
    /// <exception cref="InvalidOperationException">Names the aggregate type and the new events.</exception>
    public void EnsureNoEventsRaisedSince(ChangeTracker changeTracker)
    {
        foreach (var aggregate in changeTracker.Entries<IHasDomainEvents>().Select(entry => entry.Entity))
        {
            var before = _eventCounts.GetValueOrDefault(aggregate);
            if (aggregate.DomainEvents.Count > before)
            {
                var raised = string.Join(", ", aggregate.DomainEvents.Skip(before).Select(e => e.GetType().Name));
                throw new InvalidOperationException(
                    $"A domain event handler raised new domain events on {aggregate.GetType().Name} ({raised}). " +
                    "Pre-commit handlers may only stage changes and must not raise events (ADR-0008).");
            }
        }
    }

    /// <summary>Clears the captured aggregates' events; call only after the write succeeded.</summary>
    public void Clear()
    {
        foreach (var aggregate in _aggregates)
        {
            aggregate.ClearDomainEvents();
        }
    }
}
