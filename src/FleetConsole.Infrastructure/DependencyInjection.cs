using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Auth;
using FleetConsole.Application.Credentials;
using FleetConsole.Infrastructure.Crypto;
using FleetConsole.Infrastructure.Events;
using FleetConsole.Infrastructure.Kubernetes;
using FleetConsole.Infrastructure.Persistence;
using FleetConsole.Infrastructure.Persistence.Repositories;
using FleetConsole.Infrastructure.Time;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Infrastructure;

/// <summary>
/// Registers the Infrastructure adapters for the Application ports: the EF Core <see cref="ConsoleDbContext"/> (also the
/// <see cref="IUnitOfWork"/>), the repositories, <see cref="IReadModel"/>, <see cref="IClock"/>,
/// <see cref="IDomainEventDispatcher"/>, Data Protection with <see cref="ITokenProtector"/>, the
/// <see cref="CredentialsOptions"/>, the login <see cref="AuthOptions"/> and the Kubernetes <see cref="IClusterProbeClient"/>.
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
    /// <para><b>Data Protection</b> (ADR-0004): key ring in the database, shared by the session cookie and SA token
    /// encryption; optionally encrypted with <c>DataProtection:KeyEncryptionCertificatePath</c>.</para>
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

        // Hosted services start in registration order. The migrator must run before Data Protection's own hosted
        // service loads the key ring, or a fresh development database has no data_protection_keys table yet.
        if (builder.Environment.IsDevelopment())
        {
            builder.Services.AddHostedService<DevelopmentDatabaseMigrator>();
        }

        builder.Services.AddScoped<IUnitOfWork>(services => services.GetRequiredService<ConsoleDbContext>());
        builder.Services.AddScoped<IReadModel, ReadModel>();
        builder.Services.AddScoped<IUserRepository, UserRepository>();
        builder.Services.AddScoped<IClusterRepository, ClusterRepository>();
        builder.Services.AddScoped<ICredentialRepository, CredentialRepository>();
        builder.Services.AddScoped<IGrantRepository, GrantRepository>();
        builder.Services.AddScoped<IAuditEntryRepository, AuditEntryRepository>();
        builder.Services.AddScoped<IDomainEventDispatcher, DomainEventDispatcher>();
        builder.Services.AddSingleton<IClock, SystemClock>();

        // Kubernetes: the TLS handler factory is stateless and shared (CP2's client pool will use it too); the probe
        // client opens a short-lived session per connection test (ADR-0011).
        builder.Services.AddSingleton<ClusterTlsHandlerFactory>();
        builder.Services.AddSingleton<IClusterProbeClient>(services => new ClusterProbeClient(
            services.GetRequiredService<ClusterTlsHandlerFactory>(),
            services.GetRequiredService<ILogger<ClusterProbeClient>>(),
            ClusterProbeClient.DefaultRequestTimeout));

        builder.AddConsoleDataProtection();
        builder.Services.AddSingleton<ITokenProtector, DataProtectionTokenProtector>();

        // Credentials settings (contract §12) for the credential and connection-test use cases.
        builder.Services.AddOptions<CredentialsOptions>()
            .BindConfiguration(CredentialsOptions.SectionName)
            .Validate(o => o.ExpiryWarningDays >= 0, "Credentials:ExpiryWarningDays must not be negative.")
            .Validate(o => o.ConnectionTestTimeout > TimeSpan.Zero, "Credentials:ConnectionTestTimeout must be positive.")
            .ValidateOnStart();

        // Login options (contract §12, section "Auth"; T-0014). The host-cluster adapters that need Auth:OpenShift are
        // registered separately by AddOpenShiftIdentity (Program.cs, T-0015), so hosts without login config still start.
        builder.Services.AddOptions<AuthOptions>()
            .BindConfiguration(AuthOptions.SectionName)
            .Validate(o => o.BootstrapAdminUsers.All(u => !string.IsNullOrWhiteSpace(u)), "Auth:BootstrapAdminUsers must not contain blank entries.")
            .Validate(o => o.AdminGroups.All(g => !string.IsNullOrWhiteSpace(g)), "Auth:AdminGroups must not contain blank entries.")
            .Validate(
                o => !o.AdminGroups.Any(g => g is not null && OpenShiftGroups.IsVirtual(g)),
                "Auth:AdminGroups must not contain virtual system:* groups (every OpenShift user is in them).")
            .ValidateOnStart();

        return builder;
    }
}
