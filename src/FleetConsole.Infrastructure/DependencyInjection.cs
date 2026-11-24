using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Auth;
using FleetConsole.Application.Credentials;
using FleetConsole.Application.Proxy;
using FleetConsole.Infrastructure.Crypto;
using FleetConsole.Infrastructure.Events;
using FleetConsole.Infrastructure.Kubernetes;
using FleetConsole.Infrastructure.Persistence;
using FleetConsole.Infrastructure.Persistence.Repositories;
using FleetConsole.Infrastructure.Time;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

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
    /// <summary>Name of the database readiness check added by <c>EnrichNpgsqlDbContext</c> (the context type name).</summary>
    public const string DatabaseHealthCheckName = nameof(ConsoleDbContext);

    /// <summary>
    /// Name of the readiness check that stays Unhealthy until the Data Protection key ring has been loaded under the
    /// cross-pod lock, so a replica never serves before it shares the one key ring (ADR-0030 amendment 2026-11-24).
    /// Registered by <see cref="LoadDataProtectionKeyRingInBackground"/>.
    /// </summary>
    public const string KeyRingHealthCheckName = "keyring";

    /// <summary>
    /// Budget of the database readiness check; below the readiness probe's 3 s timeout so <c>/health</c> answers 503
    /// rather than timing out.
    /// </summary>
    public static readonly TimeSpan DatabaseHealthCheckTimeout = TimeSpan.FromSeconds(2);

    /// <summary>Adds persistence and the other Infrastructure services.</summary>
    /// <remarks>
    /// <para><b>Database:</b> the connection string comes from <c>ConnectionStrings:consoledb</c> (injected by the
    /// Aspire AppHost; set by the integration tests). It is read when the first context is created, not here, so tests
    /// can supply it late through configuration; its presence is validated on start.</para>
    /// <para><b>Why not Aspire's <c>AddNpgsqlDbContext</c>:</b> it registers a <em>pooled</em> context, and a pooled
    /// context can't take scoped constructor dependencies such as <see cref="IDomainEventDispatcher"/>. We register a
    /// regular scoped context and call <c>EnrichNpgsqlDbContext</c>, which adds the same Aspire extras (retries, health
    /// check, logging, OpenTelemetry).</para>
    /// <para><b>Development:</b> pending migrations are applied on startup (<see cref="DevelopmentDatabaseMigrator"/>).</para>
    /// <para><b>Data Protection</b> (ADR-0004): key ring in the database, shared by the session cookie and SA token
    /// encryption; encrypted with <c>DataProtection:KeyEncryptionCertificatePath</c> (required outside Development).</para>
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

        // Readiness must answer within the probe timeout (3 s, deploy/kustomize/base) even when the database drops
        // packets or EF retries: past this budget the database check reports Unhealthy instead of hanging (T-0106).
        builder.Services.PostConfigure<HealthCheckServiceOptions>(options =>
        {
            foreach (var registration in options.Registrations.Where(r => r.Name == DatabaseHealthCheckName))
            {
                registration.Timeout = DatabaseHealthCheckTimeout;
            }
        });

        // Fail fast without a connection string, in every environment (ADR-0028 §6); the context above still reads it lazily.
        builder.Services.AddOptions<ConsoleDatabaseOptions>()
            .Configure<IConfiguration>((options, configuration) =>
                options.ConnectionString = configuration.GetConnectionString(ConsoleDbContext.ConnectionName))
            .Validate(options => !string.IsNullOrWhiteSpace(options.ConnectionString), ConsoleDatabaseOptions.MissingMessage)
            .ValidateOnStart();

        // Hosted services start in registration order. The migrator must run before the key-ring warm-up
        // (KeyRingWarmupService, registered last by LoadDataProtectionKeyRingInBackground), or a fresh development
        // database has no data_protection_keys table yet.
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

        // Kubernetes: the TLS handler factory is stateless and shared; the probe client opens a short-lived session per
        // connection test (ADR-0011); the proxy's forwarding pool keeps one long-lived invoker per cluster, rebuilt when
        // the cluster's connection settings change, and disposes them all on shutdown (ADR-0020).
        builder.Services.TryAddSingleton(TimeProvider.System);
        builder.Services.AddSingleton<ClusterTlsHandlerFactory>();
        builder.Services.AddSingleton<IClusterProbeClient>(services => new ClusterProbeClient(
            services.GetRequiredService<ClusterTlsHandlerFactory>(),
            services.GetRequiredService<ILogger<ClusterProbeClient>>(),
            ClusterProbeClient.DefaultRequestTimeout));
        // The grace period for retired handlers covers the longest stream lifetime (ADR-0036 §2), so an admin cluster
        // edit never cuts an open log or terminal. ProxyOptions are bound and validated by the Api.
        builder.Services.AddSingleton<IClusterForwardingClients>(services => new ClusterForwardingClientPool(
            services.GetRequiredService<ClusterTlsHandlerFactory>(),
            services.GetRequiredService<TimeProvider>(),
            services.GetRequiredService<ILogger<ClusterForwardingClientPool>>())
        {
            RetiredHandlerGracePeriod = ClusterForwardingClientPool.GracePeriodFor(
                services.GetRequiredService<IOptions<ProxyOptions>>().Value),
        });

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

    /// <summary>
    /// Makes Data Protection load its key ring in the background instead of before the server listens, so a database
    /// outage at container start delays readiness only, never liveness (T-0106, ADR-0028 §2). The load runs under a
    /// Postgres advisory lock and is retried until it succeeds; the <see cref="KeyRingHealthCheckName"/> readiness check
    /// reports it.
    /// </summary>
    /// <remarks>
    /// Call it last, right before <c>Build()</c>: every <c>AddDataProtection</c> call (also the one inside
    /// <c>AddAuthentication</c>) re-registers the framework's blocking start-time load that this removes.
    /// </remarks>
    /// <param name="builder">The host builder, with all services registered.</param>
    /// <returns>The same builder, for chaining.</returns>
    public static IHostApplicationBuilder LoadDataProtectionKeyRingInBackground(this IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        DataProtectionSetup.LoadKeyRingInBackground(builder.Services);
        return builder;
    }
}
