using System.Diagnostics;

namespace FleetConsole.Api.Http;

/// <summary>
/// Registers RFC 9457 ProblemDetails as the API's only error format: the ProblemDetails service (used by
/// <see cref="ResultExtensions"/>, the exception handler and framework-generated errors) and
/// <see cref="GlobalExceptionHandler"/>. Pair with <c>app.UseExceptionHandler()</c> early in the pipeline.
/// </summary>
public static class ProblemDetailsSetup
{
    /// <summary>
    /// Name of the extension member carrying the W3C trace-context id (traceparent format,
    /// <c>00-&lt;trace-id&gt;-&lt;span-id&gt;-&lt;flags&gt;</c>), for correlating a response with logs/traces.
    /// </summary>
    public const string TraceIdExtension = "traceId";

    /// <summary>
    /// Adds ProblemDetails with FleetConsole's customizations (<c>instance</c> = request path, <c>traceId</c>) and the
    /// global exception handler.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <returns>The same collection, for chaining.</returns>
    public static IServiceCollection AddApiProblemDetails(this IServiceCollection services)
    {
        services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
        {
            context.ProblemDetails.Instance ??= context.HttpContext.Request.Path;

            // ASP.NET Core's default writer already adds the same value; set it explicitly so the documented contract
            // (BACKEND.md "Results and errors") doesn't depend on a framework default. Activity.Id is the traceparent
            // string (matches OpenTelemetry/Aspire); fall back to the request id when no activity exists.
            context.ProblemDetails.Extensions[TraceIdExtension] = Activity.Current?.Id ?? context.HttpContext.TraceIdentifier;
        });
        services.AddExceptionHandler<GlobalExceptionHandler>();

        return services;
    }
}
