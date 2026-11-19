namespace FleetConsole.Domain.Common;

/// <summary>
/// Marks a fact that happened inside an aggregate and that other parts of the system may react to (audit, cache
/// invalidation). Events are recorded on the aggregate via <see cref="AggregateRoot{TId}.RaiseDomainEvent"/> and
/// dispatched by the persistence layer <em>before</em> the write, in the same transaction (ADR-0008): the handlers stage
/// audit entries that commit atomically with the change, or not at all.
/// </summary>
/// <remarks>
/// Implement as an immutable <c>sealed record</c> named in the past tense (e.g. <c>GrantRevoked</c>) that references
/// aggregates by id only. Intentionally member-less: what an event carries is specific to each event.
/// </remarks>
public interface IDomainEvent;
