using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using FleetConsole.Infrastructure.Persistence.Conventions;
using FleetConsole.Infrastructure.Persistence.Converters;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace FleetConsole.Infrastructure.Persistence;

/// <summary>
/// The EF Core context for FleetConsole's own PostgreSQL database (users, clusters, credentials, grants, audit) and the
/// <see cref="IUnitOfWork"/> commands commit through. Tables and columns are snake_case; each aggregate gets an
/// <see cref="IEntityTypeConfiguration{TEntity}"/> in this assembly, picked up automatically.
/// </summary>
/// <remarks>
/// <para><b>Domain events:</b> every async save collects the events raised by tracked aggregates before saving and, once
/// the save succeeded, clears them and hands them to <see cref="IDomainEventDispatcher"/>. Synchronous
/// <c>SaveChanges</c> is refused for application data because event dispatch is asynchronous; the one exception is the
/// Data Protection key repository, which stores new keys synchronously in a context of its own.</para>
/// <para><b>Commit races:</b> through <see cref="IUnitOfWork"/>, a stale <c>xmin</c> surfaces as
/// <see cref="ConcurrencyConflictException"/> and a unique violation (SQLSTATE 23505) as
/// <see cref="DuplicateKeyException"/>, so the Application can map them to 409s without knowing EF Core.</para>
/// <para><b>Value objects and ids</b> are mapped once, by type, in <see cref="ConfigureConventions"/>; enums are stored as
/// their names (text), so the database stays readable and reordering an enum can't corrupt data.</para>
/// <para><b>Data Protection:</b> the context is also the <see cref="IDataProtectionKeyContext"/> that persists the key
/// ring (<c>data_protection_keys</c>, ADR-0004).</para>
/// <para><b>Lifetime:</b> registered as a scoped (not pooled) context because it depends on the scoped dispatcher.</para>
/// <para><b>Migrations:</b> live in <c>Persistence/Migrations</c>; applied automatically on startup in Development only
/// (<see cref="DevelopmentDatabaseMigrator"/>), by a migration job in production.</para>
/// </remarks>
public sealed class ConsoleDbContext : DbContext, IUnitOfWork, IDataProtectionKeyContext
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

    /// <summary>The Data Protection key ring (one row per key); written only by the Data Protection key manager.</summary>
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    /// <summary>
    /// Commits the command's changes (see <see cref="SaveChangesAsync(bool, CancellationToken)"/>) and translates the two
    /// expected commit failures into the Application's persistence exceptions.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A task that completes when the changes are durable.</returns>
    /// <exception cref="ConcurrencyConflictException">A row to update or delete changed (or vanished) since it was loaded.</exception>
    /// <exception cref="DuplicateKeyException">A unique index rejected the write.</exception>
    async Task IUnitOfWork.SaveChangesAsync(CancellationToken cancellationToken)
    {
        try
        {
            await SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateConcurrencyException exception)
        {
            throw new ConcurrencyConflictException("A row was changed or deleted by someone else since it was loaded.", exception);
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } postgres)
        {
            throw DuplicateKeyException.ForConstraint(postgres.ConstraintName, exception);
        }
    }

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

    /// <summary>
    /// Synchronous save, allowed <b>only</b> for Data Protection keys: ASP.NET Core's EF key repository creates a context
    /// in its own scope and calls <c>SaveChanges()</c> when it generates a key, and it has no async path. Any other
    /// pending change (aggregates, audit entries) is refused, because committing it needs the asynchronous domain event
    /// dispatch of <see cref="SaveChangesAsync(bool, CancellationToken)"/>.
    /// </summary>
    /// <param name="acceptAllChangesOnSuccess">See <see cref="DbContext.SaveChanges(bool)"/>.</param>
    /// <returns>The number of state entries written.</returns>
    /// <exception cref="NotSupportedException">When anything other than <see cref="DataProtectionKey"/> rows is pending.</exception>
    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        ChangeTracker.DetectChanges();
        var hasApplicationChanges = ChangeTracker.Entries().Any(entry =>
            entry.State is EntityState.Added or EntityState.Modified or EntityState.Deleted
            && entry.Entity is not DataProtectionKey);
        if (hasApplicationChanges)
        {
            throw new NotSupportedException("Use SaveChangesAsync: saving dispatches domain events asynchronously.");
        }

        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    /// <inheritdoc />
    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        ArgumentNullException.ThrowIfNull(configurationBuilder);
        configurationBuilder.Conventions.Add(_ => new IgnoreDomainEventsConvention());

        // Strongly typed ids → uuid, wherever they appear (keys, foreign keys, nullable uses).
        configurationBuilder.Properties<UserId>().HaveConversion<UserIdConverter>();
        configurationBuilder.Properties<ClusterId>().HaveConversion<ClusterIdConverter>();
        configurationBuilder.Properties<CredentialId>().HaveConversion<CredentialIdConverter>();
        configurationBuilder.Properties<GrantId>().HaveConversion<GrantIdConverter>();
        configurationBuilder.Properties<AuditEntryId>().HaveConversion<AuditEntryIdConverter>();

        // Single-value value objects → one column each; lengths from the Domain's constants.
        configurationBuilder.Properties<Username>().HaveConversion<UsernameConverter>().HaveMaxLength(Username.MaxLength);
        configurationBuilder.Properties<ClusterName>().HaveConversion<ClusterNameConverter>().HaveMaxLength(ClusterName.MaxLength);
        configurationBuilder.Properties<CredentialName>().HaveConversion<CredentialNameConverter>().HaveMaxLength(CredentialName.MaxLength);
        configurationBuilder.Properties<TokenFingerprint>().HaveConversion<TokenFingerprintConverter>().HaveMaxLength(TokenFingerprint.Length);
        configurationBuilder.Properties<EncryptedToken>().HaveConversion<EncryptedTokenConverter>();
        configurationBuilder.Properties<CaBundle>().HaveConversion<CaBundleConverter>();

        // Enums as their names (text) everywhere.
        configurationBuilder.Properties<Enum>().HaveConversion<string>();
    }

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(InfrastructureAssembly.Assembly);
    }
}
