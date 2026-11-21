using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Infrastructure.Crypto;

/// <summary>
/// Loads the Data Protection key ring once in the background after the host starts, so the first session cookie or SA
/// token usually finds it cached — without ever delaying startup (T-0106). It stands in for the framework's own hosted
/// service, which loads synchronously before Kestrel binds (see <see cref="DataProtectionSetup.LoadKeyRingInBackground"/>).
/// </summary>
/// <remarks>
/// A failure (typically the database being down) is only logged: the key ring is then loaded on first use, and
/// readiness (<c>/health</c>) already reports the database. A protect round-trip is the public way to force the load;
/// like the framework's warm-up it creates the first key when the ring is empty, encrypted with the configured
/// certificate.
/// </remarks>
/// <param name="provider">The app-wide Data Protection provider.</param>
/// <param name="logger">Logs a failed warm-up.</param>
internal sealed partial class KeyRingWarmupService(IDataProtectionProvider provider, ILogger<KeyRingWarmupService> logger)
    : BackgroundService
{
    /// <summary>Purpose string of the throw-away protector used only to trigger the load.</summary>
    private const string Purpose = "FleetConsole.KeyRingWarmup";

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            // The key-ring read is synchronous, ignores cancellation and may block for a minute (EF retries). Run it on
            // the thread pool so StartAsync returns at once, and stop waiting on shutdown so StopAsync isn't held up.
            await Task.Run(() => provider.CreateProtector(Purpose).Protect([0]), CancellationToken.None)
                .WaitAsync(stoppingToken)
                .ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutdown during warm-up: the abandoned read ends with the process.
        }
#pragma warning disable CA1031 // Any failure must only be logged; the key ring is retried on first use.
        catch (Exception exception)
#pragma warning restore CA1031
        {
            LogWarmupFailed(logger, exception);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "Loading the Data Protection key ring in the background failed; it is retried on first use.")]
    private static partial void LogWarmupFailed(ILogger logger, Exception exception);
}
