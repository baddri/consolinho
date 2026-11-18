using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Infrastructure.Events;
using FleetConsole.Infrastructure.Kubernetes;
using FleetConsole.Infrastructure.Persistence;
using FleetConsole.Infrastructure.Time;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Infrastructure;

/// <summary>
/// Registers the Infrastructure adapters for the Application ports: the EF Core <see cref="ConsoleDbContext"/> (also the
/// <see cref="IUnitOfWork"/>), <see cref="IReadModel"/>, <see cref="IClock"/>, <see cref="IDomainEventDispatcher"/> and
/// the Kubernetes <see cref="IClusterProbeClient"/>.
/// Called once by the Api composition root.
/// </summary>
public static class DependencyInjection
{
    /// <summary>Adds persistence and the other Infrastructure services.</summary>
    /// <remarks>
    /// <para><b>Database:</b> the connection string comes from <c>ConnectionStrings:consoledb</c> (injected by the
    /// Aspire AppHost; set by the integration tests). It is read when the first context is created, not here, so tests
    /// can supply it late through configuration.</para>
    /// <para><b>Why not Aspire's <c>AddNpgsqlDbContext</c>:</b> it registers a <em>pooled</em> context, and a pooled
    /// context can't take scoped constructor dependencies such as <see cref="IDomainEventDispatcher"/>. We register a
    /// regular scoped context and call <c>EnrichNpgsqlDbContext</c>, which adds the same Aspire extras (retries, health
    /// check, logging, OpenTelemetry).</para>
    /// <para><b>Development:</b> pending migrations are applied on startup (<see cref="DevelopmentDatabaseMigrator"/>).</para>
    /// </remarks>
    /// <param name="builder">The host builder (configuration, environment and services).</param>
    /// <returns>The same builder, for chaining.</returns>
    public static IHostApplicationBuilder AddInfrastructure(this IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.Services.AddDbContext<ConsoleDbContext>((services, options) =>
        {
            var connectionString = services.GetRequiredService<IConfiguration>().GetConnectionString(ConsoleDbContext.ConnectionName)
                ?? throw new InvalidOperationException(
                    $"Connection string 'ConnectionStrings:{ConsoleDbContext.ConnectionName}' is not configured. " +
                    "Run through the Aspire AppHost (aspire run) or set it explicitly.");
            ConsoleDbContext.ConfigureProvider(options, connectionString);
        });
        builder.EnrichNpgsqlDbContext<ConsoleDbContext>();

        builder.Services.AddScoped<IUnitOfWork>(services => services.GetRequiredService<ConsoleDbContext>());
        builder.Services.AddScoped<IReadModel, ReadModel>();
        builder.Services.AddScoped<IDomainEventDispatcher, NoOpDomainEventDispatcher>();
        builder.Services.AddSingleton<IClock, SystemClock>();

        // Kubernetes: the TLS handler factory is stateless and shared (CP2's client pool will use it too); the probe
        // client opens a short-lived session per connection test (ADR-0011).
        builder.Services.AddSingleton<ClusterTlsHandlerFactory>();
        builder.Services.AddSingleton<IClusterProbeClient>(services => new ClusterProbeClient(
            services.GetRequiredService<ClusterTlsHandlerFactory>(),
            services.GetRequiredService<ILogger<ClusterProbeClient>>(),
            ClusterProbeClient.DefaultRequestTimeout));

        if (builder.Environment.IsDevelopment())
        {
            builder.Services.AddHostedService<DevelopmentDatabaseMigrator>();
        }

        return builder;
    }
}
