namespace FleetConsole.Domain.Common;

/// <summary>
/// Base class for aggregate roots: the only entities repositories load and save, and the consistency boundary for
/// invariants. Aggregates expose behaviour methods (not setters), reference other aggregates by id only, and record
/// <see cref="IDomainEvent"/>s describing what changed.
/// </summary>
/// <remarks>
/// Events are only <em>collected</em> here. The unit of work dispatches them after a successful save and then calls
/// <see cref="ClearDomainEvents"/>; raising an event therefore has no effect if the transaction fails.
/// </remarks>
/// <typeparam name="TId">The strongly typed identifier.</typeparam>
public abstract class AggregateRoot<TId> : Entity<TId>, IHasDomainEvents
    where TId : notnull
{
    private readonly List<IDomainEvent> _domainEvents = [];

    /// <summary>Creates an aggregate with its identity.</summary>
    /// <param name="id">The aggregate's identity.</param>
    protected AggregateRoot(TId id)
        : base(id)
    {
    }

    /// <summary>Parameterless constructor for ORM materialization only.</summary>
    protected AggregateRoot()
    {
    }

    /// <inheritdoc />
    public IReadOnlyCollection<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    /// <inheritdoc />
    public void ClearDomainEvents() => _domainEvents.Clear();

    /// <summary>Records that something happened to this aggregate. Call from behaviour methods after the state change.</summary>
    /// <param name="domainEvent">The event to record.</param>
    protected void RaiseDomainEvent(IDomainEvent domainEvent)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        _domainEvents.Add(domainEvent);
    }
}
