using System.Diagnostics;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Common;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Application.Behaviors;

/// <summary>
/// Outermost pipeline step: opens an OpenTelemetry activity per dispatched request and logs its outcome and duration,
/// so every use case is observable without handler code.
/// </summary>
/// <remarks>
/// <para>Only the request <em>type name</em> is logged, never the request itself: commands carry passwords and
/// ServiceAccount tokens (SECURITY.md: secrets are never logged).</para>
/// <para>Successes log at Debug. Expected failures log at Information, except <see cref="ErrorType.Failure"/> (Warning)
/// which also marks the activity as errored; client-caused errors (validation, not found…) are not span errors.
/// Exceptions are recorded on the activity and rethrown without logging: the host's exception handler logs them once.</para>
/// </remarks>
/// <typeparam name="TRequest">The request type.</typeparam>
/// <typeparam name="TResponse">The response type.</typeparam>
/// <param name="logger">Logger categorised by this behavior.</param>
internal sealed class LoggingBehavior<TRequest, TResponse>(ILogger<LoggingBehavior<TRequest, TResponse>> logger)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    /// <inheritdoc />
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(next);

        var requestName = typeof(TRequest).Name;
        using var activity = ApplicationDiagnostics.ActivitySource.StartActivity(requestName);
        activity?.SetTag("fleetconsole.request.name", requestName);

        var startTimestamp = Stopwatch.GetTimestamp();
        try
        {
            var response = await next(cancellationToken).ConfigureAwait(false);
            var elapsedMs = Stopwatch.GetElapsedTime(startTimestamp).TotalMilliseconds;

            if (response is Result result && result.IsFailure)
            {
                activity?.SetTag("fleetconsole.error.code", result.Error.Code);
                activity?.SetTag("fleetconsole.error.type", result.Error.Type.ToString());

                var isUnexpected = result.Error.Type == ErrorType.Failure;
                if (isUnexpected)
                {
                    activity?.SetStatus(ActivityStatusCode.Error, result.Error.Code);
                }

                LoggingBehaviorLog.RequestFailed(
                    logger, isUnexpected ? LogLevel.Warning : LogLevel.Information,
                    requestName, result.Error.Code, result.Error.Type, elapsedMs);
            }
            else
            {
                LoggingBehaviorLog.RequestSucceeded(logger, requestName, elapsedMs);
            }

            return response;
        }
        catch (Exception exception)
        {
            activity?.AddException(exception);
            activity?.SetStatus(ActivityStatusCode.Error, exception.GetType().Name);
            throw;
        }
    }
}

/// <summary>Source-generated log messages for <see cref="LoggingBehavior{TRequest, TResponse}"/> (kept out of the generic class).</summary>
internal static partial class LoggingBehaviorLog
{
    [LoggerMessage(EventId = 1000, Level = LogLevel.Debug, Message = "Handled {RequestName} in {ElapsedMs:F1} ms")]
    public static partial void RequestSucceeded(ILogger logger, string requestName, double elapsedMs);

    [LoggerMessage(EventId = 1001, Message = "{RequestName} failed with {ErrorCode} ({ErrorType}) in {ElapsedMs:F1} ms")]
    public static partial void RequestFailed(ILogger logger, LogLevel level, string requestName, string errorCode, ErrorType errorType, double elapsedMs);
}
