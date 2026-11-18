using FleetConsole.Application.Abstractions;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace FleetConsole.Application.Tests;

/// <summary>
/// Builds a real DI container the way the Api does (AddApplication), plus this test assembly's handlers/validators.
/// Scope validation is on, as in Development, so lifetime mistakes surface in tests.
/// </summary>
internal static class ServiceProviderBuilder
{
    public static ServiceProvider Build(Action<IServiceCollection>? configure = null, bool withApplicationPipeline = true, IUnitOfWork? unitOfWork = null)
    {
        var services = new ServiceCollection();
        services.AddSingleton(typeof(ILogger<>), typeof(NullLogger<>));
        services.AddSingleton<CallLog>();

        if (withApplicationPipeline)
        {
            services.AddApplication();
        }
        else
        {
            services.AddScoped<Abstractions.Messaging.IDispatcher, Abstractions.Messaging.Dispatcher>();
        }

        services.AddRequestHandlers(typeof(ServiceProviderBuilder).Assembly);
        services.AddValidatorsFromAssembly(typeof(ServiceProviderBuilder).Assembly, ServiceLifetime.Scoped, includeInternalTypes: true);

        if (unitOfWork is not null)
        {
            services.AddScoped(_ => unitOfWork);
        }

        configure?.Invoke(services);
        return services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true, ValidateOnBuild = true });
    }
}
