using FleetConsole.Api.Http;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.SystemInfo.GetSystemInfo;
using Microsoft.AspNetCore.Http.HttpResults;

namespace FleetConsole.Api.Endpoints;

/// <summary>
/// <c>/api/system</c>: information about the FleetConsole deployment itself (not about managed clusters).
/// </summary>
public static class SystemEndpoints
{
    /// <summary>Maps the system endpoints under <paramref name="api"/> (the <c>/api</c> group).</summary>
    /// <param name="api">The <c>/api</c> route group.</param>
    /// <returns>The <c>/api/system</c> group, for further conventions.</returns>
    public static RouteGroupBuilder MapSystemEndpoints(this IEndpointRouteBuilder api)
    {
        var group = api.MapGroup("/system").WithTags("System");

        // The name becomes the OpenAPI operationId (stable across refactors of the handler method). The operation's
        // summary comes from GetSystemInfo's XML <summary> (.NET 10 copies XML docs into the OpenAPI document).
        group.MapGet("/info", GetSystemInfo)
            .WithName("GetSystemInfo");

        return group;
    }

    // Dispatches GetSystemInfoQuery. XML docs on endpoint handlers are published as the operation's OpenAPI summary,
    // so they describe the operation for API consumers rather than the implementation.

    /// <summary>Returns the version and environment of this FleetConsole deployment.</summary>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with <see cref="SystemInfoDto"/>, or ProblemDetails.</returns>
    internal static async Task<Results<Ok<SystemInfoDto>, ProblemHttpResult>> GetSystemInfo(
        IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new GetSystemInfoQuery(), cancellationToken).ConfigureAwait(false)).ToHttpResult();
}
