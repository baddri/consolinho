using System.Reflection;
using FleetConsole.Application.Abstractions.Caching;
using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Access;
using FleetConsole.Application.Access.LoadAccessSnapshot;
using FleetConsole.Application.Audit;
using FleetConsole.Application.Behaviors;
using FleetConsole.Application.Credentials.ConnectionTesting;
using FleetConsole.Application.Proxy;
using FleetConsole.Application.Proxy.Policies;
using FleetConsole.Domain.Common;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Application;

/// <summary>
/// Registers the Application layer: the dispatcher, every handler and validator in this assembly, and the pipeline
/// behaviors in their documented order. Called once by the Api composition root.
/// </summary>
public static class DependencyInjection
{
    /// <summary>The open generic handler contracts <see cref="AddDomainEventHandlers"/> registers (both stages).</summary>
    private static readonly Type[] DomainEventHandlerContracts = [typeof(IDomainEventHandler<>), typeof(IPostCommitDomainEventHandler<>)];

    /// <summary>
    /// Adds the dispatcher, handlers, validators and pipeline behaviors.
    /// </summary>
    /// <remarks>
    /// <para><b>Pipeline order</b> (outermost first; behaviors run in registration order — BACKEND.md):</para>
    /// <list type="number">
    ///   <item><c>LoggingBehavior</c> — activity + outcome/timing log for every request.</item>
    ///   <item><c>AuthorizationBehavior</c> — <c>IRequireAuthenticated</c>/<c>IRequireRole</c>/<c>IAdminRequest</c> → 401/403.</item>
    ///   <item><c>ReadOnlyGuardBehavior</c> — <c>IMutatingCommand</c> refused for globally read-only users (403).
    ///   Before validation so a read-only admin gets <c>Auth.ReadOnly</c>, never field errors (contract §7 check order).</item>
    ///   <item><c>ValidationBehavior</c> — FluentValidation → validation <c>Result</c>.</item>
    ///   <item><c>CachingBehavior</c> — <c>ICacheableQuery</c>; registered closed per query by
    ///   <see cref="AddCacheableQuery{TQuery, TValue}"/>, which inserts it right here (ADR-0040 §3).</item>
    ///   <item><c>UnitOfWorkBehavior</c> — commands only; saves after a successful handler.</item>
    /// </list>
    /// <para>Everything is scoped so handlers and behaviors share the request's unit of work and current user.
    /// Ports (<c>IUnitOfWork</c>, <c>IClock</c>, <c>ICurrentUser</c>) are registered by Infrastructure/Api; the
    /// authorization and read-only behaviors are only constructed for requests that declare those markers, so other
    /// requests run without an <c>ICurrentUser</c>.</para>
    /// </remarks>
    /// <param name="services">The service collection.</param>
    /// <returns>The same collection, for chaining.</returns>
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddScoped<IDispatcher, Dispatcher>();
        services.AddRequestHandlers(ApplicationAssembly.Assembly);
        services.AddValidatorsFromAssembly(ApplicationAssembly.Assembly, ServiceLifetime.Scoped, includeInternalTypes: true);

        // Audit (ADR-0008): pre-commit domain event handlers + the audit trail they record through.
        services.AddDomainEventHandlers(ApplicationAssembly.Assembly);
        services.AddScoped<IAuditTrail, AuditTrail>();

        // Connection tests (ADR-0011): step orchestration shared by the TestCredential and TestToken handlers.
        services.AddScoped<ConnectionTester>();

        // Grant resolution (ADR-0034): the cached access snapshot (ADR-0040 §4) + AccessResolver per request, shared by
        // the proxy and the switcher (PREC-8).
        services.AddScoped<ClusterAccessReader>();

        // Proxy policies (ADR-0019 §7) run in registration order, first refusal wins. The order is contract (CP2 §4):
        // user read-only before read-only grant (both in MutationGuardPolicy), then 413 last, so a read-only user
        // with an oversized body gets 403, not 413.
        services.AddProxyPolicy<MutationGuardPolicy>();
        services.AddProxyPolicy<RequestBodyLimitPolicy>();

        // Pipeline — order matters, see remarks. Keep the slots for future behaviors so insertion points stay obvious.
        services.AddScoped(typeof(IPipelineBehavior<,>), typeof(LoggingBehavior<,>));
        services.AddScoped(typeof(IPipelineBehavior<,>), typeof(AuthorizationBehavior<,>));
        services.AddScoped(typeof(IPipelineBehavior<,>), typeof(ReadOnlyGuardBehavior<,>));
        services.AddScoped(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));
        // Step 5, CachingBehavior: no open-generic registration (it can't map Result<TValue>). Each cacheable query
        // registers it closed with AddCacheableQuery<TQuery, TValue>(), which inserts it right after ValidationBehavior.
        services.AddScoped(typeof(IPipelineBehavior<,>), typeof(UnitOfWorkBehavior<,>));

        // Cached queries (ADR-0040 §3): after the pipeline, which AddCacheableQuery inserts into.
        services.AddCacheableQuery<LoadAccessSnapshotQuery, AccessSnapshot>();

        return services;
    }

    /// <summary>
    /// Turns on caching for <typeparamref name="TQuery"/>: registers <see cref="CachingBehavior{TQuery, TValue}"/>
    /// closed for it, at pipeline step 5 — directly after <see cref="ValidationBehavior{TRequest, TResponse}"/>, before
    /// every later behavior and the handler (ADR-0040 §3).
    /// </summary>
    /// <remarks>
    /// The container returns behaviors in descriptor order, mixing closed and open-generic registrations, so the
    /// position in the collection <em>is</em> the pipeline position. Appending would put the behavior after anything
    /// registered later; the descriptor is therefore inserted after the <c>ValidationBehavior</c> registration, which
    /// makes the call order irrelevant. Call it after the pipeline registrations in <see cref="AddApplication"/>.
    /// </remarks>
    /// <typeparam name="TQuery">The cacheable query.</typeparam>
    /// <typeparam name="TValue">The value of its successful result.</typeparam>
    /// <param name="services">The service collection holding the Application pipeline.</param>
    /// <returns>The same collection, for chaining.</returns>
    /// <exception cref="InvalidOperationException">The pipeline (its <c>ValidationBehavior</c>) is not registered yet.</exception>
    internal static IServiceCollection AddCacheableQuery<TQuery, TValue>(this IServiceCollection services)
        where TQuery : ICacheableQuery<TValue>
    {
        ArgumentNullException.ThrowIfNull(services);

        var validation = services.LastOrDefault(descriptor =>
            descriptor.ServiceType == typeof(IPipelineBehavior<,>) && descriptor.ImplementationType == typeof(ValidationBehavior<,>))
            ?? throw new InvalidOperationException(
                $"Register the Application pipeline before calling {nameof(AddCacheableQuery)} for '{typeof(TQuery)}'.");

        services.Insert(
            services.IndexOf(validation) + 1,
            ServiceDescriptor.Scoped<IPipelineBehavior<TQuery, Result<TValue>>, CachingBehavior<TQuery, TValue>>());
        return services;
    }

    /// <summary>
    /// Registers every concrete, non-generic class in <paramref name="assembly"/> that implements
    /// <see cref="IRequestHandler{TRequest, TResponse}"/> (including internal ones) as a scoped service.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <param name="assembly">The assembly to scan.</param>
    /// <returns>The same collection, for chaining.</returns>
    /// <exception cref="InvalidOperationException">When a request type already has a handler: exactly one handler per
    /// request is required, and a silent "last one wins" would hide the mistake.</exception>
    internal static IServiceCollection AddRequestHandlers(this IServiceCollection services, Assembly assembly)
    {
        var handlerRegistrations =
            from type in assembly.GetTypes()
            where type is { IsClass: true, IsAbstract: false, IsGenericTypeDefinition: false }
            from contract in type.GetInterfaces()
            where contract.IsGenericType && contract.GetGenericTypeDefinition() == typeof(IRequestHandler<,>)
            select (Contract: contract, Implementation: type);

        foreach (var (contract, implementation) in handlerRegistrations)
        {
            var existing = services.FirstOrDefault(descriptor => descriptor.ServiceType == contract);
            if (existing is not null)
            {
                throw new InvalidOperationException(
                    $"'{contract}' is implemented by both '{existing.ImplementationType}' and '{implementation}'. " +
                    "Each request must have exactly one handler.");
            }

            services.AddScoped(contract, implementation);
        }

        return services;
    }

    /// <summary>
    /// Registers every concrete, non-generic class in <paramref name="assembly"/> (including internal ones) as a scoped
    /// <see cref="IDomainEventHandler{TEvent}"/> and/or <see cref="IPostCommitDomainEventHandler{TEvent}"/> for each event
    /// type it handles. An event may have several handlers; the <c>IDomainEventDispatcher</c> resolves all of them from
    /// the request scope, before the write (ADR-0008) or after the commit (ADR-0040 §1).
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <param name="assembly">The assembly to scan.</param>
    /// <returns>The same collection, for chaining.</returns>
    internal static IServiceCollection AddDomainEventHandlers(this IServiceCollection services, Assembly assembly)
    {
        var registrations =
            from type in assembly.GetTypes()
            where type is { IsClass: true, IsAbstract: false, IsGenericTypeDefinition: false }
            from contract in type.GetInterfaces()
            where contract.IsGenericType && DomainEventHandlerContracts.Contains(contract.GetGenericTypeDefinition())
            select (Contract: contract, Implementation: type);

        foreach (var (contract, implementation) in registrations)
        {
            services.AddScoped(contract, implementation);
        }

        return services;
    }
}
