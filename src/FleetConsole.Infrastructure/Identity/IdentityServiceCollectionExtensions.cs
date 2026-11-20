using FleetConsole.Application.Auth;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FleetConsole.Infrastructure.Identity;

/// <summary>
/// Registers the host-cluster identity adapters used by login (ADR-0007/0010): <see cref="OpenShiftHostOptions"/>
/// (validated on start), the <see cref="OpenShiftHostHttpClient.Name"/> client, <see cref="IExternalIdentityClient"/>,
/// <see cref="IOAuthServerMetadataProvider"/> and its warm-up.
/// </summary>
/// <remarks>
/// Separate from <c>AddInfrastructure</c> on purpose (orchestrator ruling, T-0014): <c>Auth:OpenShift</c> is required
/// configuration, so it is registered by the composition root together with the OAuth handler that needs it
/// (<c>Program.cs</c>, T-0015). Hosts without login (tests of other features) keep starting without that configuration.
/// The login options (<c>Auth</c> section, <see cref="AuthOptions"/>) are bound by <c>AddInfrastructure</c>.
/// </remarks>
public static class IdentityServiceCollectionExtensions
{
    /// <summary>Adds the OpenShift host identity adapters.</summary>
    /// <param name="builder">The host builder.</param>
    /// <returns>The same builder, for chaining.</returns>
    public static IHostApplicationBuilder AddOpenShiftIdentity(this IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        var services = builder.Services;

        services.AddOptions<OpenShiftHostOptions>()
            .BindConfiguration(OpenShiftHostOptions.SectionName)
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<OpenShiftHostOptions>, OpenShiftHostOptionsValidator>();
        services.AddSingleton<OpenShiftHostTrust>();

#pragma warning disable EXTEXP0001 // RemoveAllResilienceHandlers is experimental; see the comment below.
        services.AddHttpClient(OpenShiftHostHttpClient.Name, client => client.Timeout = OpenShiftHostHttpClient.Timeout)
            .ConfigurePrimaryHttpMessageHandler(sp => OpenShiftHostHttpClient.CreatePrimaryHandler(
                sp.GetRequiredService<IOptions<OpenShiftHostOptions>>().Value,
                sp.GetRequiredService<OpenShiftHostTrust>()))
            // Single-use OAuth codes must never be replayed: no ServiceDefaults retries on this client (see
            // OpenShiftHostHttpClient remarks). The API is still marked experimental (EXTEXP0001); it is the documented
            // way to opt one client out of ConfigureHttpClientDefaults, and OpenShiftIdentityRegistrationTests fails
            // if it ever stops removing the retries.
            .RemoveAllResilienceHandlers();
#pragma warning restore EXTEXP0001

        services.AddSingleton<IExternalIdentityClient, OpenShiftUserClient>();
        services.AddSingleton<IOAuthServerMetadataProvider, OAuthServerMetadataProvider>();
        services.AddHostedService<OAuthMetadataWarmupService>();

        return builder;
    }
}
