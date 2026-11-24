using System.Collections.Concurrent;
using System.Reflection;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Domain.Common;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Infrastructure.Events;

/// <summary>
/// The <see cref="IDomainEventDispatcher"/>: for each event, in order, resolves every handler of the event's concrete
/// type from the current DI scope and awaits them one after the other. Called by <c>ConsoleDbContext</c> twice per save:
/// <see cref="IDomainEventHandler{TEvent}"/>s before the write (ADR-0008), <see cref="IPostCommitDomainEventHandler{TEvent}"/>s
/// after the commit (ADR-0040 §1).
/// </summary>
/// <remarks>
/// <para>Scoped, and it takes the <em>scope's</em> <see cref="IServiceProvider"/>: handlers then share the request's
/// unit of work and current user. Handlers are resolved lazily at dispatch time, which also avoids a constructor cycle
/// (context → dispatcher → audit handler → audit repository → context).</para>
/// <para>Events arrive as <see cref="IDomainEvent"/>; the closed generic call per concrete event type is built once by
/// reflection and cached, so dispatch costs a dictionary lookup per event.</para>
/// <para>Pre-commit: a handler's exception propagates unchanged and aborts the save. Post-commit: each handler call is
/// isolated; an exception is logged (Warning, event and handler type only) and the next handler runs.</para>
/// </remarks>
/// <param name="services">The current scope's service provider.</param>
/// <param name="logger">Logs failed post-commit handlers.</param>
internal sealed partial class DomainEventDispatcher(IServiceProvider services, ILogger<DomainEventDispatcher> logger) : IDomainEventDispatcher
{
    /// <summary>Event id of the Warning logged when a post-commit handler throws.</summary>
    public const int PostCommitHandlerFailedEventId = 3600;

    private static readonly ConcurrentDictionary<Type, Func<IServiceProvider, IDomainEvent, CancellationToken, Task>> Invokers = new();

    private static readonly ConcurrentDictionary<Type, Func<IServiceProvider, ILogger, IDomainEvent, CancellationToken, Task>> PostCommitInvokers = new();

    private static readonly MethodInfo InvokeHandlersMethod =
        typeof(DomainEventDispatcher).GetMethod(nameof(InvokeHandlersAsync), BindingFlags.NonPublic | BindingFlags.Static)!;

    private static readonly MethodInfo InvokePostCommitHandlersMethod =
        typeof(DomainEventDispatcher).GetMethod(nameof(InvokePostCommitHandlersAsync), BindingFlags.NonPublic | BindingFlags.Static)!;

    /// <inheritdoc />
    public async Task DispatchAsync(IReadOnlyList<IDomainEvent> domainEvents, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvents);

        foreach (var domainEvent in domainEvents)
        {
            var invoke = Invokers.GetOrAdd(domainEvent.GetType(), CreateInvoker);
            await invoke(services, domainEvent, cancellationToken).ConfigureAwait(false);
        }
    }

    /// <inheritdoc />
    public async Task DispatchPostCommitAsync(IReadOnlyList<IDomainEvent> domainEvents, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvents);

        foreach (var domainEvent in domainEvents)
        {
            var invoke = PostCommitInvokers.GetOrAdd(domainEvent.GetType(), CreatePostCommitInvoker);
            await invoke(services, logger, domainEvent, cancellationToken).ConfigureAwait(false);
        }
    }

    private static Func<IServiceProvider, IDomainEvent, CancellationToken, Task> CreateInvoker(Type eventType) =>
        InvokeHandlersMethod.MakeGenericMethod(eventType)
            .CreateDelegate<Func<IServiceProvider, IDomainEvent, CancellationToken, Task>>();

    /// <summary>Runs every handler registered for <typeparamref name="TEvent"/>, in registration order.</summary>
    private static async Task InvokeHandlersAsync<TEvent>(IServiceProvider services, IDomainEvent domainEvent, CancellationToken cancellationToken)
        where TEvent : IDomainEvent
    {
        foreach (var handler in services.GetServices<IDomainEventHandler<TEvent>>())
        {
            await handler.Handle((TEvent)domainEvent, cancellationToken).ConfigureAwait(false);
        }
    }

    private static Func<IServiceProvider, ILogger, IDomainEvent, CancellationToken, Task> CreatePostCommitInvoker(Type eventType) =>
        InvokePostCommitHandlersMethod.MakeGenericMethod(eventType)
            .CreateDelegate<Func<IServiceProvider, ILogger, IDomainEvent, CancellationToken, Task>>();

    /// <summary>
    /// Runs every post-commit handler registered for <typeparamref name="TEvent"/>, in registration order, isolating
    /// each one: the change is already committed, so a failing handler must neither fail the command nor starve the
    /// handlers after it (ADR-0040 §1).
    /// </summary>
    [System.Diagnostics.CodeAnalysis.SuppressMessage(
        "Design",
        "CA1031:Do not catch general exception types",
        Justification = "Post-commit handlers are best effort by contract: any failure is logged and swallowed.")]
    private static async Task InvokePostCommitHandlersAsync<TEvent>(
        IServiceProvider services, ILogger logger, IDomainEvent domainEvent, CancellationToken cancellationToken)
        where TEvent : IDomainEvent
    {
        foreach (var handler in services.GetServices<IPostCommitDomainEventHandler<TEvent>>())
        {
            try
            {
                await handler.HandleAsync((TEvent)domainEvent, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception exception)
            {
                // OperationCanceledException included (e.g. a handler's own timeout). Only type names are logged: the
                // exception text could carry event payload (ids, names) or infrastructure details.
                LogPostCommitHandlerFailed(
                    logger, typeof(TEvent).Name, handler.GetType().FullName ?? handler.GetType().Name, exception.GetType().FullName ?? exception.GetType().Name);
            }
        }
    }

    [LoggerMessage(EventId = PostCommitHandlerFailedEventId, Level = LogLevel.Warning,
        Message = "Post-commit handler {Handler} failed for domain event {EventType} with {ExceptionType}; the change stays committed and the remaining handlers still run")]
    private static partial void LogPostCommitHandlerFailed(ILogger logger, string eventType, string handler, string exceptionType);
}
