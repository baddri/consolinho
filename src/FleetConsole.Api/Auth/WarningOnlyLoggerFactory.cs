namespace FleetConsole.Api.Auth;

/// <summary>
/// Wraps the application's <see cref="ILoggerFactory"/> for <see cref="OpenShiftOAuthHandler"/> so that its loggers drop
/// everything below <see cref="LogLevel.Warning"/>, whatever the logging configuration says.
/// </summary>
/// <remarks>
/// <para><b>Why:</b> ASP.NET Core's <c>RemoteAuthenticationHandler</c> logs every failed callback at Information
/// ("Error from RemoteAuthentication: {ErrorMessage}"). For an OAuth error redirect that message is built from the
/// request's <c>error_description</c> and <c>error_uri</c>: remote, attacker-influenceable text (T-0015 review). The
/// failure is recorded by <see cref="OpenShiftLoginEvents"/> instead (EventId 2200: outcome, exception type, trace id).</para>
/// <para><b>Why not a logging filter rule:</b> rule selection prefers provider-specific rules over category rules, so a
/// <c>Logging:Console:LogLevel</c> entry or any provider-scoped filter would bring the messages back. Enforcing the level
/// in the logger itself holds for every provider and configuration.</para>
/// </remarks>
/// <param name="inner">The application's logger factory (owned by the container; never disposed here).</param>
internal sealed class WarningOnlyLoggerFactory(ILoggerFactory inner) : ILoggerFactory
{
    /// <inheritdoc />
    public ILogger CreateLogger(string categoryName) => new WarningOnlyLogger(inner.CreateLogger(categoryName));

    /// <inheritdoc />
    public void AddProvider(ILoggerProvider provider) => inner.AddProvider(provider);

    /// <summary>Does nothing: the wrapped factory belongs to the container.</summary>
    public void Dispose()
    {
    }

    private sealed class WarningOnlyLogger(ILogger logger) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => logger.BeginScope(state);

        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Warning && logger.IsEnabled(logLevel);

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (IsEnabled(logLevel))
            {
                logger.Log(logLevel, eventId, state, exception, formatter);
            }
        }
    }
}
