using System.Reflection;
using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Audit;
using FleetConsole.Application.Behaviors;
using FleetConsole.Application.Credentials.ConnectionTesting;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Application;

/// <summary>
/// Registers the Application layer: the dispatcher, every handler and validator in this assembly, and the pipeline
/// behaviors in their documented order. Called once by the Api composition root.
/// </summary>
public static class DependencyInjection
{
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
    ///   <item><c>CachingBehavior</c> — <c>ICacheableQuery</c> (future).</item>
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

        // Pipeline — order matters, see remarks. Keep the slots for future behaviors so insertion points stay obvious.
        services.AddScoped(typeof(IPipelineBehavior<,>), typeof(LoggingBehavior<,>));
        services.AddScoped(typeof(IPipelineBehavior<,>), typeof(AuthorizationBehavior<,>));
        services.AddScoped(typeof(IPipelineBehavior<,>), typeof(ReadOnlyGuardBehavior<,>));
        services.AddScoped(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));
        // (future) services.AddScoped(typeof(IPipelineBehavior<,>), typeof(CachingBehavior<,>));
        services.AddScoped(typeof(IPipelineBehavior<,>), typeof(UnitOfWorkBehavior<,>));

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
    /// <see cref="IDomainEventHandler{TEvent}"/> for each event type it handles. An event may have several handlers;
    /// the <c>IDomainEventDispatcher</c> resolves all of them from the request scope before the write (ADR-0008).
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
            where contract.IsGenericType && contract.GetGenericTypeDefinition() == typeof(IDomainEventHandler<>)
            select (Contract: contract, Implementation: type);

        foreach (var (contract, implementation) in registrations)
        {
            services.AddScoped(contract, implementation);
        }

        return services;
    }
}
