namespace FleetConsole.Domain.Common;

/// <summary>
/// Non-generic view of an aggregate's pending domain events. Lets infrastructure collect events from every tracked
/// aggregate (e.g. <c>ChangeTracker.Entries&lt;IHasDomainEvents&gt;()</c>) without knowing each aggregate's id type.
/// Implemented by <see cref="AggregateRoot{TId}"/>; there is no reason to implement it anywhere else.
/// </summary>
public interface IHasDomainEvents
{
    /// <summary>Events raised since the aggregate was loaded or last cleared, in the order they were raised.</summary>
    IReadOnlyCollection<IDomainEvent> DomainEvents { get; }

    /// <summary>Forgets pending events. Called by the unit of work once they have been handed to the dispatcher.</summary>
    void ClearDomainEvents();
}
