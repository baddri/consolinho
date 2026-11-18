using FleetConsole.Application.Abstractions;
using FleetConsole.Infrastructure.Persistence.Conventions;
using Microsoft.EntityFrameworkCore;

namespace FleetConsole.Infrastructure.Persistence;

/// <summary>
/// The EF Core context for FleetConsole's own PostgreSQL database (users, clusters, credentials, grants, audit) and the
/// <see cref="IUnitOfWork"/> commands commit through. Tables and columns are snake_case; each aggregate gets an
/// <see cref="IEntityTypeConfiguration{TEntity}"/> in this assembly, picked up automatically.
/// </summary>
/// <remarks>
/// <para><b>Domain events:</b> every async save collects the events raised by tracked aggregates before saving and, once
/// the save succeeded, clears them and hands them to <see cref="IDomainEventDispatcher"/>. Synchronous
/// <c>SaveChanges</c> is not supported because event dispatch is asynchronous.</para>
/// <para><b>Lifetime:</b> registered as a scoped (not pooled) context because it depends on the scoped dispatcher.</para>
/// <para><b>Migrations:</b> live in <c>Persistence/Migrations</c>; applied automatically on startup in Development only
/// (<see cref="DevelopmentDatabaseMigrator"/>), by a migration job in production.</para>
/// </remarks>
public sealed class ConsoleDbContext : DbContext, IUnitOfWork
{
    /// <summary>Name of the connection string (<c>ConnectionStrings:consoledb</c>); matches the Aspire database resource.</summary>
    public const string ConnectionName = "consoledb";

    /// <summary>The EF migrations history table, renamed so it follows the same snake_case naming as everything else.</summary>
    public const string MigrationsHistoryTable = "__ef_migrations_history";

    private readonly IDomainEventDispatcher _domainEventDispatcher;

    /// <summary>Creates the context. Resolved from DI; tests and design-time tools build it the same way.</summary>
    /// <param name="options">Provider options, built with <see cref="ConfigureProvider"/>.</param>
    /// <param name="domainEventDispatcher">Receives domain events after successful saves.</param>
    public ConsoleDbContext(DbContextOptions<ConsoleDbContext> options, IDomainEventDispatcher domainEventDispatcher)
        : base(options)
    {
        _domainEventDispatcher = domainEventDispatcher;
    }

    /// <summary>
    /// Applies FleetConsole's provider settings: Npgsql, snake_case naming and the renamed history table. The single
    /// place these settings live, shared by runtime registration and the design-time factory.
    /// </summary>
    /// <param name="options">The options builder to configure.</param>
    /// <param name="connectionString">The PostgreSQL connection string, or <see langword="null"/> at design time
    /// (generating migrations needs the provider, not a connection).</param>
    /// <returns>The same builder, for chaining.</returns>
    public static DbContextOptionsBuilder ConfigureProvider(DbContextOptionsBuilder options, string? connectionString)
    {
        ArgumentNullException.ThrowIfNull(options);

        options.UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable(MigrationsHistoryTable));
        options.UseSnakeCaseNamingConvention();
        return options;
    }

    /// <inheritdoc />
    async Task IUnitOfWork.SaveChangesAsync(CancellationToken cancellationToken) =>
        await SaveChangesAsync(cancellationToken).ConfigureAwait(false);

    /// <summary>Saves changes, then dispatches the domain events raised by the saved aggregates.</summary>
    /// <param name="acceptAllChangesOnSuccess">See <see cref="DbContext.SaveChangesAsync(bool, CancellationToken)"/>.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The number of state entries written.</returns>
    public override async Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        var pending = PendingDomainEvents.Capture(ChangeTracker);

        var written = await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken).ConfigureAwait(false);

        var domainEvents = pending.TakeEvents();
        if (domainEvents.Count > 0)
        {
            await _domainEventDispatcher.DispatchAsync(domainEvents, cancellationToken).ConfigureAwait(false);
        }

        return written;
    }

    /// <summary>Not supported: domain events are dispatched asynchronously, so use <c>SaveChangesAsync</c>.</summary>
    /// <param name="acceptAllChangesOnSuccess">Unused.</param>
    /// <returns>Never returns.</returns>
    /// <exception cref="NotSupportedException">Always.</exception>
    public override int SaveChanges(bool acceptAllChangesOnSuccess) =>
        throw new NotSupportedException("Use SaveChangesAsync: saving dispatches domain events asynchronously.");

    /// <inheritdoc />
    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        ArgumentNullException.ThrowIfNull(configurationBuilder);
        configurationBuilder.Conventions.Add(_ => new IgnoreDomainEventsConvention());
    }

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(InfrastructureAssembly.Assembly);
    }
}
