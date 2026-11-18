using FleetConsole.DevOAuth.Configuration;
using FleetConsole.DevOAuth.OAuth;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace FleetConsole.DevOAuth;

/// <summary>Registers the emulator's services: validated options, the in-memory grant store and the clock.</summary>
internal static class DevOAuthServiceCollectionExtensions
{
    /// <summary>
    /// Binds <see cref="DevOAuthOptions"/> from the <c>DevOAuth</c> configuration section (validated at startup) and
    /// registers <see cref="DevOAuthStore"/> as a singleton.
    /// </summary>
    /// <remarks>
    /// <see cref="TimeProvider"/> is registered with <c>TryAdd</c>; tests replace it with a manual clock to expire
    /// codes and tokens without waiting.
    /// </remarks>
    /// <param name="services">The service collection.</param>
    /// <param name="configuration">Application configuration containing the <c>DevOAuth</c> section.</param>
    /// <returns>The same service collection, for chaining.</returns>
    public static IServiceCollection AddDevOAuth(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<DevOAuthOptions>()
            .Bind(configuration.GetSection(DevOAuthOptions.SectionName))
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<DevOAuthOptions>, DevOAuthOptionsValidator>();

        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<DevOAuthStore>();

        return services;
    }
}
