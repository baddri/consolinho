using System.Collections.Concurrent;
using System.Reflection;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Domain.Common;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Infrastructure.Events;

/// <summary>
/// The <see cref="IDomainEventDispatcher"/>: for each event, in order, resolves every
/// <see cref="IDomainEventHandler{TEvent}"/> of the event's concrete type from the current DI scope and awaits them one
/// after the other. Called by <c>ConsoleDbContext</c> before the write (ADR-0008).
/// </summary>
/// <remarks>
/// <para>Scoped, and it takes the <em>scope's</em> <see cref="IServiceProvider"/>: handlers then share the request's
/// unit of work and current user. Handlers are resolved lazily at dispatch time, which also avoids a constructor cycle
/// (context → dispatcher → audit handler → audit repository → context).</para>
/// <para>Events arrive as <see cref="IDomainEvent"/>; the closed generic call per concrete event type is built once by
/// reflection and cached, so dispatch costs a dictionary lookup per event.</para>
/// <para>A handler's exception propagates unchanged and aborts the save.</para>
/// </remarks>
/// <param name="services">The current scope's service provider.</param>
internal sealed class DomainEventDispatcher(IServiceProvider services) : IDomainEventDispatcher
{
    private static readonly ConcurrentDictionary<Type, Func<IServiceProvider, IDomainEvent, CancellationToken, Task>> Invokers = new();

    private static readonly MethodInfo InvokeHandlersMethod =
        typeof(DomainEventDispatcher).GetMethod(nameof(InvokeHandlersAsync), BindingFlags.NonPublic | BindingFlags.Static)!;

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
}
