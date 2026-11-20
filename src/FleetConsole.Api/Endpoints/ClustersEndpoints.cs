using FleetConsole.Api.Http;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Clusters.ListAccessibleClusters;
using Microsoft.AspNetCore.Http.HttpResults;

namespace FleetConsole.Api.Endpoints;

/// <summary>
/// The cluster switcher's data source (contract §6, SW-1): <c>GET /api/clusters</c> for every signed-in user. Distinct
/// from <c>/api/admin/clusters</c>: it shows only what the user may switch to and never exposes API URL, CA or
/// credential data.
/// </summary>
public static class ClustersEndpoints
{
    /// <summary>Maps the cluster endpoints under <paramref name="api"/> (the <c>/api</c> group, authenticated).</summary>
    /// <param name="api">The <c>/api</c> route group.</param>
    /// <returns>The <c>/api/clusters</c> group.</returns>
    public static RouteGroupBuilder MapClustersEndpoints(this IEndpointRouteBuilder api)
    {
        ArgumentNullException.ThrowIfNull(api);
        var group = api.MapGroup("/clusters").WithTags("Clusters");
        group.MapGet("", ListMyClusters).WithName("ListMyClusters");
        return group;
    }

    /// <summary>
    /// Lists the enabled clusters the signed-in user has a grant on, sorted by environment (production, staging,
    /// development) then name, with the effective access mode (readOnly when the user is globally read-only). Empty when
    /// the user has no grants, administrators included.
    /// </summary>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the clusters.</returns>
    internal static async Task<Results<Ok<IReadOnlyList<AccessibleClusterDto>>, ProblemHttpResult>> ListMyClusters(
        IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new ListAccessibleClustersQuery(), cancellationToken).ConfigureAwait(false)).ToHttpResult();
}
