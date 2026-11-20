using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace FleetConsole.Infrastructure.Persistence;

/// <summary>
/// Applies pending EF Core migrations to the console database: the one migration path, shared by the Api's
/// <c>migrate</c> mode (the production init container, ADR-0027) and <see cref="DevelopmentDatabaseMigrator"/>.
/// Migrations are forward-only.
/// </summary>
/// <remarks>
/// <para><b>Concurrent pods:</b> every run holds a session-level Postgres advisory lock (<see cref="AdvisoryLockKey"/>)
/// from reading the pending migrations until they are applied, so runs are fully serialised and a later run finds
/// nothing pending. EF Core's own migration lock is not enough: Npgsql's is a table lock released with each
/// migration's transaction, and a run that read the pending list earlier then re-applies migrations another run
/// applied meanwhile (<c>42P07 relation already exists</c>; reproduced by <c>DatabaseMigratorTests</c>).</para>
/// <para>Creates the database when it does not exist (development and tests; production provisions it).</para>
/// </remarks>
public static partial class DatabaseMigrator
{
    /// <summary>Applies all pending migrations and logs their names (Information).</summary>
    /// <param name="services">The application's root services (a scope is created for the context).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>
    /// The migrations this run applied, in order; empty when the schema was up to date. The list is read under the
    /// advisory lock, so a run that waited for a concurrent one reports nothing pending.
    /// </returns>
    public static async Task<IReadOnlyList<string>> MigrateAsync(IServiceProvider services, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(services);
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(DatabaseMigrator).FullName!);

        var scope = services.CreateAsyncScope();
        await using (scope.ConfigureAwait(false))
        {
            var database = scope.ServiceProvider.GetRequiredService<ConsoleDbContext>().Database;
            await EnsureDatabaseExistsAsync(database, cancellationToken).ConfigureAwait(false);

            // Unpooled: the lock belongs to the session, and a pooled connection's session outlives Dispose.
            var lockConnectionString = new NpgsqlConnectionStringBuilder(database.GetConnectionString()) { Pooling = false }.ConnectionString;
            var lockConnection = new NpgsqlConnection(lockConnectionString);
            await using (lockConnection.ConfigureAwait(false))
            {
                await lockConnection.OpenAsync(cancellationToken).ConfigureAwait(false);
                await AcquireLockAsync(lockConnection, cancellationToken).ConfigureAwait(false);

                var pending = (await database.GetPendingMigrationsAsync(cancellationToken).ConfigureAwait(false)).ToArray();
                await database.MigrateAsync(cancellationToken).ConfigureAwait(false);

                // Closing the unpooled connection ends the session and releases the lock (also on failure).
                if (pending.Length == 0)
                {
                    LogUpToDate(logger);
                }

                foreach (var migration in pending)
                {
                    LogApplied(logger, migration);
                }

                return pending;
            }
        }
    }

    /// <summary>Key of the advisory lock that serialises migration runs (an arbitrary constant unique to FleetConsole).</summary>
    public const long AdvisoryLockKey = 0x466C_6565_744D_6967; // "FleetMig"

    private static async Task EnsureDatabaseExistsAsync(DatabaseFacade database, CancellationToken cancellationToken)
    {
        var creator = database.GetService<IRelationalDatabaseCreator>();
        if (await creator.ExistsAsync(cancellationToken).ConfigureAwait(false))
        {
            return;
        }

        try
        {
            await creator.CreateAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (PostgresException exception) when (exception.SqlState == PostgresErrorCodes.DuplicateDatabase)
        {
            // A concurrent run created it first.
        }
    }

    /// <summary>Waits until no other run holds the migration lock and takes it for this session.</summary>
    private static async Task AcquireLockAsync(NpgsqlConnection connection, CancellationToken cancellationToken)
    {
        var command = new NpgsqlCommand("select pg_advisory_lock(@key)", connection);
        await using (command.ConfigureAwait(false))
        {
            command.Parameters.AddWithValue("key", AdvisoryLockKey);
            await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    [LoggerMessage(EventId = 3500, Level = LogLevel.Information, Message = "Database schema is up to date")]
    private static partial void LogUpToDate(ILogger logger);

    [LoggerMessage(EventId = 3501, Level = LogLevel.Information, Message = "Applied database migration {Migration}")]
    private static partial void LogApplied(ILogger logger, string migration);
}
