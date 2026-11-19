namespace FleetConsole.Domain.Common;

/// <summary>
/// Base class for aggregate roots: the only entities repositories load and save, and the consistency boundary for
/// invariants. Aggregates expose behaviour methods (not setters), reference other aggregates by id only, and record
/// <see cref="IDomainEvent"/>s describing what changed.
/// </summary>
/// <remarks>
/// Events are only <em>collected</em> here. The unit of work dispatches them to pre-commit handlers just before it
/// writes (ADR-0008), so what the handlers stage (audit entries) commits in the same transaction as the change, and
/// calls <see cref="ClearDomainEvents"/> only after the write succeeded. If the transaction fails, nothing the event
/// caused is persisted.
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

    /// <summary>
    /// Optimistic concurrency token of the persisted row. Only persistence sets it: EF Core maps it to PostgreSQL's
    /// <c>xmin</c> system column, which changes on every write. The Api returns it to clients as <c>version</c> and
    /// edit/transition requests send it back, so a stale edit is rejected with <c>Concurrency.Conflict</c> (ADR-0013).
    /// </summary>
    /// <remarks>
    /// <c>0</c> for an aggregate that has not been loaded from the database. No domain behaviour reads or changes it.
    /// </remarks>
    public uint Version { get; private set; }

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
