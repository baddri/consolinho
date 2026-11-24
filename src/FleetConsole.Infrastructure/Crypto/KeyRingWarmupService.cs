using FleetConsole.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace FleetConsole.Infrastructure.Crypto;

/// <summary>
/// Loads the Data Protection key ring in the background after the host starts — under a Postgres advisory lock shared
/// by all replicas — and marks the pod ready for it (<see cref="KeyRingWarmupState"/>, <see cref="KeyRingHealthCheck"/>).
/// It stands in for the framework's own hosted service, which loads synchronously before Kestrel binds (see
/// <see cref="DataProtectionSetup.LoadKeyRingInBackground"/>, T-0106, ADR-0028 §2).
/// </summary>
/// <remarks>
/// <para><b>Why the lock (ADR-0030 amendment 2026-11-24):</b> a fresh install starts ≥ 3 pods at once against an empty
/// key table. Unserialised, each pod would create its own active key and cache only that one until the 24 h ring
/// refresh, so a cookie or SA token protected on one pod could not be unprotected on another. Under
/// <see cref="DataProtectionSetup.KeyRingLockKey"/> the first pod creates the key and commits it before releasing the
/// lock; the others then load the ring and find it. The lock lives on an unpooled connection (as in
/// <see cref="DatabaseMigrator"/>): closing it ends the session and releases the lock, also on failure. Because a holder
/// whose node died leaves a half-open session that Postgres would keep (with its lock) for hours, the session sets
/// short server TCP keepalives, and waiters give up after <see cref="KeyRingWarmupOptions.LockTimeout"/> and retry.</para>
/// <para><b>Retries:</b> a failure (typically the database being down) is logged and retried with a capped backoff
/// (<see cref="InitialRetryDelay"/> doubling to <see cref="MaxRetryDelay"/>) until success or shutdown, because the
/// fallback — the lazy load on first use — is exactly the unserialised path. The pod stays unready meanwhile.</para>
/// <para>A protect round-trip is the public way to force the load; like the framework's warm-up it creates the first
/// key when the ring is empty, encrypted with the configured certificate.</para>
/// </remarks>
/// <param name="provider">The app-wide Data Protection provider.</param>
/// <param name="scopes">Creates the scope whose <see cref="ConsoleDbContext"/> yields the current connection string.</param>
/// <param name="state">Set once the ring is loaded; read by the readiness check.</param>
/// <param name="options">The lock timeout.</param>
/// <param name="time">Clock for the retry delays (replaceable in tests).</param>
/// <param name="logger">Logs failed attempts.</param>
internal sealed partial class KeyRingWarmupService(
    IDataProtectionProvider provider,
    IServiceScopeFactory scopes,
    KeyRingWarmupState state,
    KeyRingWarmupOptions options,
    TimeProvider time,
    ILogger<KeyRingWarmupService> logger)
    : BackgroundService
{
    /// <summary>Delay before the first retry; doubled after every further failure up to <see cref="MaxRetryDelay"/>.</summary>
    public static readonly TimeSpan InitialRetryDelay = TimeSpan.FromSeconds(2);

    /// <summary>Cap of the retry delay, so a pod notices a recovered database within half a minute.</summary>
    public static readonly TimeSpan MaxRetryDelay = TimeSpan.FromSeconds(30);

    /// <summary>Event id of the per-attempt failure Warning (e.g. a lock timeout or the database being down).</summary>
    public const int WarmupFailedEventId = 3510;

    /// <summary>Purpose string of the throw-away protector used only to trigger the load.</summary>
    private const string Purpose = "FleetConsole.KeyRingWarmup";

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var delay = InitialRetryDelay;
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await LoadUnderLockAsync(stoppingToken).ConfigureAwait(false);
                state.MarkLoaded();
                return;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Shutdown during warm-up: an abandoned key-ring read ends with the process.
                return;
            }
#pragma warning disable CA1031 // Any failure is logged and retried; the pod stays unready meanwhile.
            catch (Exception exception)
#pragma warning restore CA1031
            {
                LogWarmupFailed(logger, exception, attempt, delay);
            }

            try
            {
                await Task.Delay(delay, time, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            delay = delay * 2 < MaxRetryDelay ? delay * 2 : MaxRetryDelay;
        }
    }

    /// <summary>Takes the key-ring advisory lock, loads the ring (creating the first key if none exists), releases it.</summary>
    private async Task LoadUnderLockAsync(CancellationToken cancellationToken)
    {
        // Read per attempt: the context resolves the connection string from configuration when it is created.
        string connectionString;
        var scope = scopes.CreateAsyncScope();
        await using (scope.ConfigureAwait(false))
        {
            connectionString = scope.ServiceProvider.GetRequiredService<ConsoleDbContext>().Database.GetConnectionString()
                ?? throw new InvalidOperationException("The console database has no connection string.");
        }

        // Unpooled: the lock belongs to the session, and a pooled connection's session outlives Dispose.
        var lockConnection = new NpgsqlConnection(
            new NpgsqlConnectionStringBuilder(connectionString) { Pooling = false }.ConnectionString);
        await using (lockConnection.ConfigureAwait(false))
        {
            await lockConnection.OpenAsync(cancellationToken).ConfigureAwait(false);
            await ConfigureSessionAsync(lockConnection, cancellationToken).ConfigureAwait(false);
            await AcquireLockAsync(lockConnection, cancellationToken).ConfigureAwait(false);

            // The key-ring read is synchronous, ignores cancellation and may block for a minute (EF retries). Run it on
            // the thread pool and stop waiting on shutdown so StopAsync isn't held up. Closing the connection below
            // releases the lock.
            await Task.Run(() => provider.CreateProtector(Purpose).Protect([0]), CancellationToken.None)
                .WaitAsync(cancellationToken)
                .ConfigureAwait(false);
        }
    }

    /// <summary>
    /// Server keepalives (30 s idle, 10 s × 3 probes) reap this session ~1 min after its pod's node vanishes, releasing
    /// the lock; <c>lock_timeout</c> bounds how long this session waits for a lock held by such a ghost.
    /// </summary>
    private async Task ConfigureSessionAsync(NpgsqlConnection connection, CancellationToken cancellationToken)
    {
        var lockTimeoutMs = (long)options.LockTimeout.TotalMilliseconds;
        var command = new NpgsqlCommand(
            "set tcp_keepalives_idle = 30; set tcp_keepalives_interval = 10; set tcp_keepalives_count = 3; " +
            $"set lock_timeout = {lockTimeoutMs}", // an integer from our own options, not user input
            connection);
        await using (command.ConfigureAwait(false))
        {
            await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    /// <summary>Waits until no other pod holds the key-ring lock and takes it for this session.</summary>
    private static async Task AcquireLockAsync(NpgsqlConnection connection, CancellationToken cancellationToken)
    {
        var command = new NpgsqlCommand("select pg_advisory_lock(@key)", connection);
        await using (command.ConfigureAwait(false))
        {
            // No client-side timeout: the server's lock_timeout (set above from KeyRingWarmupOptions) bounds the wait.
            // Npgsql's default 30 s CommandTimeout would otherwise fire first and make that option meaningless.
            command.CommandTimeout = 0;
            command.Parameters.AddWithValue("key", DataProtectionSetup.KeyRingLockKey);
            await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    [LoggerMessage(EventId = WarmupFailedEventId, Level = LogLevel.Warning,
        Message = "Loading the Data Protection key ring failed (attempt {Attempt}); retrying in {RetryDelay}. The pod stays unready meanwhile.")]
    private static partial void LogWarmupFailed(ILogger logger, Exception exception, int attempt, TimeSpan retryDelay);
}
