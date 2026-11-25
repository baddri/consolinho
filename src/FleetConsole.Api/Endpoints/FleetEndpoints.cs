using FleetConsole.Api.Fleet;
using FleetConsole.Api.Http;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Fleet;
using FleetConsole.Application.Fleet.GetFleetStatus;
using Microsoft.AspNetCore.Http.HttpResults;

namespace FleetConsole.Api.Endpoints;

/// <summary>
/// The fleet overview's data source (CP5 contract §2, ADR-0041): <c>GET /api/fleet/status</c> streams one health line
/// per cluster the signed-in user may access, as NDJSON in completion order. Any active user may call it; the pod-wide
/// <see cref="FleetSetup.StatusRateLimitPolicy"/> limiter bounds how many are computed at once.
/// </summary>
public static class FleetEndpoints
{
    /// <summary>Maps the fleet endpoints under <paramref name="api"/> (the <c>/api</c> group, authenticated).</summary>
    /// <param name="api">The <c>/api</c> route group.</param>
    /// <returns>The <c>/api/fleet</c> group.</returns>
    public static RouteGroupBuilder MapFleetEndpoints(this IEndpointRouteBuilder api)
    {
        ArgumentNullException.ThrowIfNull(api);
        var group = api.MapGroup("/fleet").WithTags("Fleet");
        group.MapGet("/status", GetFleetStatus)
            .WithName("GetFleetStatus")
            .RequireRateLimiting(FleetSetup.StatusRateLimitPolicy)
            .Produces<FleetClusterStatusDto>(StatusCodes.Status200OK, NdjsonResult<FleetClusterStatusDto>.ContentType)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);
        return group;
    }

    /// <summary>
    /// Streams the health of every cluster the signed-in user may access: one <c>FleetClusterStatus</c> JSON object per
    /// line, flushed as each cluster completes (not sorted). A user without access gets 200 with an empty body; 503
    /// <c>Fleet.Busy</c> (with <c>Retry-After</c>) when the pod is already computing its maximum of fleet requests.
    /// </summary>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>The NDJSON stream, or ProblemDetails when access could not be resolved (before any byte is sent).</returns>
    internal static async Task<Results<NdjsonResult<FleetClusterStatusDto>, ProblemHttpResult>> GetFleetStatus(
        IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        var result = await dispatcher.Send(new GetFleetStatusQuery(), cancellationToken).ConfigureAwait(false);
        if (result.IsFailure)
        {
            return result.ToProblemDetails();
        }

        // Lazy: probing starts when the result enumerates the stream; the token is the request's abort token, which the
        // result also enumerates with.
        return new NdjsonResult<FleetClusterStatusDto>(result.Value.ReadAllAsync(cancellationToken));
    }
}
