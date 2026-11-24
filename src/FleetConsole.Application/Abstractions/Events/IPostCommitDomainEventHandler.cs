using System.Diagnostics.CodeAnalysis;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Abstractions.Events;

/// <summary>
/// Reacts to one kind of domain event <b>after</b> the change that raised it has been committed (ADR-0008 §6,
/// ADR-0040 §1). This is the stage for side effects that must only follow a durable write and can't be rolled back,
/// such as invalidating cached access snapshots; staging changes in the unit of work belongs in the pre-commit
/// <see cref="IDomainEventHandler{TEvent}"/> instead.
/// </summary>
/// <remarks>
/// <para>Registered (scoped) by <c>AddApplication()</c> through the same assembly scan as the pre-commit handlers, or by
/// the feature that owns the handler; invoked by <see cref="IDomainEventDispatcher.DispatchPostCommitAsync"/>, which
/// <c>ConsoleDbContext.SaveChangesAsync</c> calls once the write succeeded, in the request scope, one handler after
/// the other. Nothing is dispatched when the write fails.</para>
/// <para><b>Contract — at-most-once, best effort:</b> an exception (including <see cref="OperationCanceledException"/>)
/// is logged as a Warning naming the event and handler types and then swallowed; the commit stands, the command still
/// succeeds and the next handler still runs. A crash between commit and dispatch skips the handler entirely. Handlers
/// must therefore only do things a backstop heals (e.g. a cache entry that also expires by TTL).</para>
/// <para><b>Rules for implementations:</b></para>
/// <list type="bullet">
///   <item>never use the <c>DbContext</c> or the <see cref="IUnitOfWork"/>: the request's context has just saved, and a
///   second save from here would re-enter the event pipeline;</item>
///   <item>never raise further domain events (nothing would dispatch them);</item>
///   <item>bounded I/O only (e.g. cache calls with timeouts): the request waits for the handler, and the token passed
///   is <see cref="CancellationToken.None"/>, so the handler itself must not block indefinitely.</item>
/// </list>
/// </remarks>
/// <typeparam name="TEvent">The concrete event type handled.</typeparam>
[SuppressMessage(
    "Naming",
    "CA1711:Identifiers should not have incorrect suffix",
    Justification = "Handles domain events in the CQRS sense, not a .NET event delegate; the name is the documented contract (ADR-0040).")]
public interface IPostCommitDomainEventHandler<in TEvent>
    where TEvent : IDomainEvent
{
    /// <summary>Handles one event whose change is already committed.</summary>
    /// <param name="domainEvent">The event, raised by an aggregate whose change is now durable.</param>
    /// <param name="cancellationToken">Always <see cref="CancellationToken.None"/> from the dispatcher: the commit
    /// happened, so an aborted client request must not skip the side effect.</param>
    /// <returns>A task that completes when the event is handled.</returns>
    Task HandleAsync(TEvent domainEvent, CancellationToken cancellationToken);
}
