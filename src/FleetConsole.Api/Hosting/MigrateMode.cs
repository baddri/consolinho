using FleetConsole.Infrastructure.Persistence;

namespace FleetConsole.Api.Hosting;

/// <summary>
/// The image's <c>migrate</c> mode (ADR-0027): <c>dotnet FleetConsole.Api.dll migrate</c> applies pending database
/// migrations and exits, run as the Deployment's init container. Program checks it right after <c>builder.Build()</c>,
/// before the host starts, so no start-time validation (OAuth, public origin, Data Protection certificate) and no hosted
/// service runs: only <c>ConnectionStrings:consoledb</c> is needed.
/// </summary>
/// <remarks>
/// Only the exact argument list <c>["migrate"]</c> selects it; any other arguments (none, or e.g. <c>--urls</c>) start
/// the normal web host, so command-line configuration keeps working there.
/// </remarks>
internal static partial class MigrateMode
{
    /// <summary>The command-line argument that selects the mode.</summary>
    public const string Argument = "migrate";

    /// <summary>Whether the process was started in migrate mode.</summary>
    /// <param name="args">The process arguments.</param>
    /// <returns><see langword="true"/> when <paramref name="args"/> is exactly <c>["migrate"]</c>.</returns>
    public static bool IsRequested(string[] args) => args is [Argument];

    /// <summary>Applies the migrations, logs the outcome and disposes the (never started) application.</summary>
    /// <param name="app">The built application; its services provide the context and logging.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The process exit code: 0 on success (also when nothing was pending), 1 on failure.</returns>
    public static async Task<int> RunAsync(WebApplication app, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(app);
        await using (app.ConfigureAwait(false))
        {
            var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(MigrateMode).FullName!);
            try
            {
                await DatabaseMigrator.MigrateAsync(app.Services, cancellationToken).ConfigureAwait(false);
                return 0;
            }
#pragma warning disable CA1031 // Any failure ends the init container with exit code 1; the pod then restarts it.
            catch (Exception exception)
#pragma warning restore CA1031
            {
                // Type and message only: no stack trace noise, and nothing that could carry the connection string.
                var exceptionType = exception.GetType();
                LogFailed(logger, exceptionType, exception.Message);
                return 1;
            }
        }
    }

    [LoggerMessage(EventId = 2500, Level = LogLevel.Critical, Message = "Database migration failed: {ExceptionType}: {ExceptionMessage}")]
    private static partial void LogFailed(ILogger logger, Type exceptionType, string exceptionMessage);
}
