using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Hosting;

/// <summary>
/// Runs the web host and turns invalid configuration into a clean failure (ADR-0028 §6): every
/// <see cref="OptionsValidationException"/> failure from the start-time validation becomes one Critical
/// <c>Startup configuration error: …</c> line (messages name keys, never values) and exit code 1, instead of an
/// unhandled-exception crash with a stack trace. When several options types are invalid at once (a typical first
/// deploy), the startup validator throws an <see cref="AggregateException"/> of them; that is handled the same way.
/// Other exceptions are bugs or infrastructure failures and propagate.
/// </summary>
internal static partial class ConsoleHostRunner
{
    /// <summary>Starts the application, waits for shutdown and disposes it.</summary>
    /// <param name="app">The configured application.</param>
    /// <returns>The process exit code: 0 after a normal shutdown, 1 when the configuration is invalid.</returns>
    public static async Task<int> RunAsync(WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        // Not app.RunAsync(): it disposes the host (and with it the loggers) before a caller could log the failures.
        await using (app.ConfigureAwait(false))
        {
            try
            {
                // Validate before starting: Host.StartAsync resolves the hosted services *before* it runs the startup
                // validator, and Data Protection's hosted service eagerly reads the (invalid) certificate options, so
                // only that one failure would surface and the others (e.g. Console:PublicOrigin) would stay hidden.
                // Running the validator first reports every invalid options type at once (found by check-image.sh).
                app.Services.GetService<IStartupValidator>()?.Validate();
                await app.StartAsync().ConfigureAwait(false);
            }
            catch (Exception exception) when (TryGetConfigurationFailures(exception, out var failures))
            {
                var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(ConsoleHostRunner).FullName!);
                foreach (var failure in failures)
                {
                    LogConfigurationError(logger, failure);
                }

                return 1;
            }

            await app.WaitForShutdownAsync().ConfigureAwait(false);
            return 0;
        }
    }

    /// <summary>
    /// Extracts the configuration failures from a start exception: an <see cref="OptionsValidationException"/>, or an
    /// <see cref="AggregateException"/> (nested ones flattened) whose inner exceptions all are.
    /// </summary>
    /// <param name="exception">The exception thrown by the host start.</param>
    /// <param name="failures">Every failure message, in order, when the method returns <see langword="true"/>.</param>
    /// <returns>Whether the exception is purely a configuration validation failure.</returns>
    internal static bool TryGetConfigurationFailures(Exception exception, out IReadOnlyList<string> failures)
    {
        ArgumentNullException.ThrowIfNull(exception);
        Exception[] inner = exception is AggregateException aggregate
            ? [.. aggregate.Flatten().InnerExceptions]
            : [exception];

        if (inner.Length == 0 || !inner.All(e => e is OptionsValidationException))
        {
            failures = [];
            return false;
        }

        failures = inner.Cast<OptionsValidationException>().SelectMany(e => e.Failures).ToArray();
        return true;
    }

    [LoggerMessage(EventId = 2501, Level = LogLevel.Critical, Message = "Startup configuration error: {Failure}")]
    private static partial void LogConfigurationError(ILogger logger, string failure);
}
