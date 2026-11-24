using FleetConsole.Application.Abstractions.Persistence;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace FleetConsole.Api.Http;

/// <summary>
/// Last line of defence for exceptions escaping endpoints (bugs and infrastructure faults — expected failures are
/// <c>Result</c>s). Logs the exception once and answers with a ProblemDetails body instead of an empty 500 or an
/// HTML error page.
/// </summary>
/// <remarks>
/// <para>Outside Development the response never contains exception details (message, type, stack trace): they can
/// reveal internals or secrets. Correlate via the <c>traceId</c> member and the logs instead.</para>
/// <para>Special cases: <see cref="BadHttpRequestException"/> (malformed request body/parameters, which minimal APIs
/// throw in Development) keeps its 4xx status; a cancellation caused by the client disconnecting is not an error and
/// is answered with 499 without logging an error or writing a body; an unreachable database
/// (<see cref="PersistenceUnavailableException"/> anywhere in the inner-exception chain, since the cache may wrap its
/// loader's exception) is an outage, not a bug: 503 with code <see cref="PersistenceErrors.UnavailableCode"/>,
/// <c>Retry-After</c> and a Warning instead of an Error (ADR-0040 §8). The 499 case is defensive: in .NET 10
/// <c>ExceptionHandlerMiddleware</c> normally handles client aborts itself before calling any
/// <see cref="IExceptionHandler"/>, so the branch only runs if the handler is invoked another way.</para>
/// </remarks>
/// <param name="problemDetailsService">Writes the ProblemDetails using the app's customizations.</param>
/// <param name="environment">Decides whether exception details may be exposed.</param>
/// <param name="logger">Logger for unhandled exceptions.</param>
internal sealed partial class GlobalExceptionHandler(
    IProblemDetailsService problemDetailsService,
    IHostEnvironment environment,
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    /// <summary>Seconds a client should wait before retrying after a 503 for an unreachable database.</summary>
    private const string RetryAfterSeconds = "5";

    /// <inheritdoc />
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(httpContext);
        ArgumentNullException.ThrowIfNull(exception);

        if (exception is OperationCanceledException && httpContext.RequestAborted.IsCancellationRequested)
        {
            LogRequestAborted(logger, httpContext.Request.Method, httpContext.Request.Path);
            httpContext.Response.StatusCode = StatusCodes.Status499ClientClosedRequest;
            return true;
        }

        int status;
        string? title = null;
        string? code = null;
        if (FindPersistenceUnavailable(exception) is { } unavailable)
        {
            status = StatusCodes.Status503ServiceUnavailable;
            title = "The service is temporarily unavailable.";
            code = PersistenceErrors.UnavailableCode;
            httpContext.Response.Headers.RetryAfter = RetryAfterSeconds;
            var cause = unavailable.InnerException?.GetType().FullName ?? nameof(PersistenceUnavailableException);
            LogPersistenceUnavailable(logger, httpContext.Request.Method, httpContext.Request.Path, cause);
        }
        else if (exception is BadHttpRequestException badRequest)
        {
            status = badRequest.StatusCode;
            LogBadRequest(logger, httpContext.Request.Method, httpContext.Request.Path, status);
        }
        else
        {
            status = StatusCodes.Status500InternalServerError;
            title = "An unexpected error occurred.";
            LogUnhandledException(logger, exception, httpContext.Request.Method, httpContext.Request.Path);
        }

        httpContext.Response.StatusCode = status;
        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = environment.IsDevelopment() ? exception.ToString() : null,
        };
        if (code is not null)
        {
            // Same member as Result-mapped problems, so clients branch on one stable code field.
            problem.Extensions[ResultExtensions.ErrorCodeExtension] = code;
        }

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        }).ConfigureAwait(false);
    }

    /// <summary>The first <see cref="PersistenceUnavailableException"/> in the exception's inner-exception chain, if any.</summary>
    private static PersistenceUnavailableException? FindPersistenceUnavailable(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is PersistenceUnavailableException unavailable)
            {
                return unavailable;
            }
        }

        return null;
    }

    [LoggerMessage(EventId = 2000, Level = LogLevel.Error, Message = "Unhandled exception while processing {Method} {Path}")]
    private static partial void LogUnhandledException(ILogger logger, Exception exception, string method, PathString path);

    [LoggerMessage(EventId = 2001, Level = LogLevel.Information, Message = "Rejected malformed request {Method} {Path} with {StatusCode}")]
    private static partial void LogBadRequest(ILogger logger, string method, PathString path, int statusCode);

    [LoggerMessage(EventId = 2002, Level = LogLevel.Debug, Message = "Client aborted {Method} {Path}")]
    private static partial void LogRequestAborted(ILogger logger, string method, PathString path);

    // Type name only: the provider's message can name the database host.
    [LoggerMessage(EventId = 2003, Level = LogLevel.Warning,
        Message = "Database unavailable while processing {Method} {Path} ({CauseType}); answered 503")]
    private static partial void LogPersistenceUnavailable(ILogger logger, string method, PathString path, string causeType);
}
