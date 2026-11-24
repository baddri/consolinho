using System.Threading.RateLimiting;
using FleetConsole.Api.Http;
using FleetConsole.Application.Fleet;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Fleet;

/// <summary>
/// Registers what <c>GET /api/fleet/status</c> needs in the Api (ADR-0041 §5): the validated <see cref="FleetOptions"/>
/// (<c>Fleet:*</c>) and the pod-wide concurrency limiter <see cref="StatusRateLimitPolicy"/>. The query, the probe and
/// its reader are registered by Application and Infrastructure.
/// </summary>
/// <remarks>
/// The limiter is the fleet's DoS bound: one fleet request fans out to every accessible cluster, so the number of
/// requests computed at once per pod is capped (<c>Fleet:MaxConcurrentRequests</c>), a bounded number wait
/// (<c>Fleet:RequestQueueLimit</c>, oldest first) and the rest get 503 <c>Fleet.Busy</c> with <c>Retry-After</c>.
/// The permit is held for the whole stream (endpoint limiter semantics) — that is the intent, the stream is the work.
/// </remarks>
public static class FleetSetup
{
    /// <summary>The named rate limiter policy the fleet status endpoint opts into.</summary>
    public const string StatusRateLimitPolicy = "fleet-status";

    /// <summary>The ProblemDetails <c>code</c> of a request rejected because the pod's fleet slots and queue are full.</summary>
    public const string BusyCode = "Fleet.Busy";

    /// <summary>Seconds a rejected client should wait before retrying (contract §2).</summary>
    private const string RetryAfterSeconds = "5";

    // The single partition: the bound is per pod, not per user (one user can't be "fair" against a fan-out storm).
    private const string GlobalPartition = "fleet";

    /// <summary>
    /// Binds <see cref="FleetOptions"/> from <see cref="FleetOptions.SectionName"/> (validated on start, so a bad bound
    /// stops the host instead of degrading every fleet request) and adds the <see cref="StatusRateLimitPolicy"/> limiter.
    /// </summary>
    /// <param name="builder">The Api's application builder.</param>
    /// <returns>The same builder, for chaining.</returns>
    public static WebApplicationBuilder AddFleetStatus(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.Services.AddOptions<FleetOptions>()
            .BindConfiguration(FleetOptions.SectionName)
            .Validate(options => options.IsValid(), FleetOptions.InvalidMessage)
            .ValidateOnStart();

        builder.Services.AddRateLimiter(limiter =>
        {
            limiter.RejectionStatusCode = StatusCodes.Status503ServiceUnavailable;
            limiter.OnRejected = (context, _) => WriteBusyAsync(context.HttpContext);
            limiter.AddPolicy(StatusRateLimitPolicy, context =>
            {
                // The factory runs once per partition key; with one key the limiter is created once, from the
                // validated options (Fleet:* is not reloadable at runtime).
                var options = context.RequestServices.GetRequiredService<IOptions<FleetOptions>>().Value;
                return RateLimitPartition.GetConcurrencyLimiter(GlobalPartition, _ => new ConcurrencyLimiterOptions
                {
                    PermitLimit = options.MaxConcurrentRequests,
                    QueueLimit = options.RequestQueueLimit,
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                });
            });
        });

        return builder;
    }

    /// <summary>Writes the 503 <see cref="BusyCode"/> ProblemDetails (same shape and writer as every other API error).</summary>
    private static ValueTask WriteBusyAsync(HttpContext context)
    {
        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        context.Response.Headers.RetryAfter = RetryAfterSeconds;
        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status503ServiceUnavailable,
            Title = "The service is temporarily unavailable.",
            Detail = "Too many fleet status requests are in progress. Retry shortly.",
        };
        problem.Extensions[ResultExtensions.ErrorCodeExtension] = BusyCode;

        var problems = context.RequestServices.GetRequiredService<IProblemDetailsService>();
        return problems.WriteAsync(new ProblemDetailsContext { HttpContext = context, ProblemDetails = problem });
    }
}
