using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Tests.Audit;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace FleetConsole.Application.Tests;

/// <summary>
/// Builds a real DI container the way the Api does (AddApplication), plus this test assembly's handlers/validators.
/// Scope validation is on, as in Development, so lifetime mistakes surface in tests.
/// </summary>
/// <remarks>
/// AddApplication registers the audit event handlers, whose <c>AuditTrail</c> needs <see cref="ICurrentUser"/>,
/// <see cref="IClock"/> and <see cref="IAuditEntryRepository"/>. With <c>withAuditPorts</c> (default) anonymous/fake
/// ports are registered first, so tests can still override them. Tests that must prove a request runs with <em>no</em>
/// <see cref="ICurrentUser"/> registered pass <c>withAuditPorts: false</c>, which also turns off validate-on-build (the
/// audit handlers couldn't be built without the ports, and those tests never resolve them).
/// </remarks>
internal static class ServiceProviderBuilder
{
    public static ServiceProvider Build(
        Action<IServiceCollection>? configure = null,
        bool withApplicationPipeline = true,
        IUnitOfWork? unitOfWork = null,
        bool withAuditPorts = true)
    {
        var services = new ServiceCollection();
        services.AddSingleton(typeof(ILogger<>), typeof(NullLogger<>));
        services.AddSingleton<CallLog>();

        // Ports the Application's own handlers depend on (normally provided by Infrastructure/Api); needed because
        // ValidateOnBuild checks every registered handler.
        services.AddSingleton<IAppEnvironment>(new FakeAppEnvironment());
        if (withAuditPorts)
        {
            services.AddSingleton<IClock, FixedClock>();
            services.AddScoped<IAuditEntryRepository, CapturingAuditEntryRepository>();
            services.AddScoped<ICurrentUser>(_ => FakeCurrentUser.Anonymous);
        }

        if (withApplicationPipeline)
        {
            services.AddApplication();
        }
        else
        {
            services.AddScoped<Application.Abstractions.Messaging.IDispatcher, Application.Abstractions.Messaging.Dispatcher>();
        }

        services.AddRequestHandlers(typeof(ServiceProviderBuilder).Assembly);
        services.AddValidatorsFromAssembly(typeof(ServiceProviderBuilder).Assembly, ServiceLifetime.Scoped, includeInternalTypes: true);

        if (unitOfWork is not null)
        {
            services.AddScoped(_ => unitOfWork);
        }

        configure?.Invoke(services);
        return services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true, ValidateOnBuild = withAuditPorts });
    }
}
