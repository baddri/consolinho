using System.Diagnostics.CodeAnalysis;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Abstractions.Events;

/// <summary>
/// Reacts to one kind of domain event <b>before</b> the change that raised it is written, in the same unit of work and
/// database transaction (ADR-0008). The audit trail is built from these handlers (<c>Application/Audit/EventHandlers</c>),
/// so an audited change and its audit entry commit together or not at all.
/// </summary>
/// <remarks>
/// <para>Registered (scoped) by <c>AddApplication()</c> through assembly scanning and invoked by the
/// <see cref="IDomainEventDispatcher"/>, which <c>ConsoleDbContext.SaveChangesAsync</c> calls before writing.</para>
/// <para><b>Rules for implementations</b> (the write has not happened yet):</para>
/// <list type="bullet">
///   <item>only <em>stage</em> changes in the unit of work (e.g. <c>IAuditTrail.Record</c>); never call
///   <see cref="IUnitOfWork.SaveChangesAsync"/>;</item>
///   <item>no network I/O and no other side effects that can't be rolled back;</item>
///   <item>never raise further domain events: the context throws <see cref="InvalidOperationException"/> if an aggregate
///   has new pending events after dispatch (no cascades).</item>
/// </list>
/// <para>An exception thrown here aborts the save (nothing is written) and surfaces as a 500: a broken handler is a bug,
/// and failing closed is what keeps "no change without its audit entry" true.</para>
/// </remarks>
/// <typeparam name="TEvent">The concrete event type handled.</typeparam>
[SuppressMessage(
    "Naming",
    "CA1711:Identifiers should not have incorrect suffix",
    Justification = "Handles domain events in the CQRS sense, not a .NET event delegate; the name is the documented contract (ADR-0008).")]
public interface IDomainEventHandler<in TEvent>
    where TEvent : IDomainEvent
{
    /// <summary>Handles one event, staging any resulting changes in the current unit of work.</summary>
    /// <param name="domainEvent">The event, raised by an aggregate that is about to be saved.</param>
    /// <param name="cancellationToken">Cancellation token of the save.</param>
    /// <returns>A task that completes when the event is handled.</returns>
    Task Handle(TEvent domainEvent, CancellationToken cancellationToken);
}
