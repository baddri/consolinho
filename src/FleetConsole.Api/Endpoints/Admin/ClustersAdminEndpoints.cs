using FleetConsole.Api.Http;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Clusters.DeleteCluster;
using FleetConsole.Application.Clusters.DisableCluster;
using FleetConsole.Application.Clusters.EnableCluster;
using FleetConsole.Application.Clusters.GetCluster;
using FleetConsole.Application.Clusters.ListClusters;
using FleetConsole.Application.Clusters.RegisterCluster;
using FleetConsole.Application.Clusters.UpdateCluster;
using FleetConsole.Domain.Common;
using Microsoft.AspNetCore.Http.HttpResults;

namespace FleetConsole.Api.Endpoints.Admin;

/// <summary>
/// <c>/api/admin/clusters</c>: cluster registration and maintenance (contract §8.2, CLU-1..8). Each endpoint combines
/// route values and the request body into one command or query; the credential and grant routes under a cluster are
/// mapped by their own features.
/// </summary>
/// <remarks>
/// <para><b>Commands return keys, endpoints re-query</b> (ADR-0013 §5): after a successful command the endpoint
/// dispatches <see cref="GetClusterQuery"/>, so the response carries the <c>version</c> written by the commit, not the
/// one the handler loaded.</para>
/// <para>Authorization (admin role, read-only guard), validation and the version check all happen in the pipeline and
/// handlers; the endpoints only translate HTTP.</para>
/// </remarks>
public static class ClustersAdminEndpoints
{
    /// <summary>Maps the cluster endpoints into the <c>/api/admin</c> group.</summary>
    /// <param name="admin">The <c>/api/admin</c> group.</param>
    /// <returns>The <c>/api/admin/clusters</c> group.</returns>
    public static RouteGroupBuilder MapClustersAdminEndpoints(this RouteGroupBuilder admin)
    {
        ArgumentNullException.ThrowIfNull(admin);

        var clusters = admin.MapGroup("/clusters").WithTags("Clusters");

        clusters.MapGet("", ListClusters).WithName("ListClusters");
        clusters.MapPost("", RegisterCluster).WithName("RegisterCluster");
        clusters.MapGet("/{name}", GetCluster).WithName("GetCluster");
        clusters.MapPut("/{name}", UpdateCluster).WithName("UpdateCluster");
        clusters.MapPost("/{name}/enable", EnableCluster).WithName("EnableCluster");
        clusters.MapPost("/{name}/disable", DisableCluster).WithName("DisableCluster");
        clusters.MapDelete("/{name}", DeleteCluster).WithName("DeleteCluster");

        return clusters;
    }

    // XML docs on the handlers are published as OpenAPI summaries (written for API consumers); implementation notes are
    // in // comments.

    /// <summary>
    /// Lists all clusters, sorted by name, with credential expiry, grant count and last connection test roll-ups.
    /// </summary>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the clusters.</returns>
    internal static async Task<Results<Ok<IReadOnlyList<ClusterListItemDto>>, ProblemHttpResult>> ListClusters(
        IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new ListClustersQuery(), cancellationToken).ConfigureAwait(false)).ToHttpResult();

    /// <summary>Registers a cluster. Fails with 409 Clusters.NameTaken when the name exists.</summary>
    /// <param name="request">The new cluster.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>201 with the cluster and its Location.</returns>
    internal static async Task<Results<Created<ClusterDetailDto>, ProblemHttpResult>> RegisterCluster(
        RegisterClusterRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var registered = await dispatcher.Send(
            new RegisterClusterCommand(
                request.Name,
                request.DisplayName,
                request.ApiUrl,
                request.Environment,
                request.Distribution,
                request.WebConsoleUrl,
                request.Description,
                request.CaBundle,
                request.SkipTlsVerify,
                request.IsEnabled),
            cancellationToken).ConfigureAwait(false);
        if (registered.IsFailure)
        {
            return registered.ToProblemDetails();
        }

        var detail = await dispatcher.Send(new GetClusterQuery(registered.Value), cancellationToken).ConfigureAwait(false);
        // Cluster names are DNS labels, so they need no escaping in the path.
        return detail.ToHttpResult(cluster => TypedResults.Created($"/api/admin/clusters/{cluster.Name}", cluster));
    }

    /// <summary>
    /// Returns one cluster including its CA certificates. Fails with 404 Clusters.NotFound for an unknown name.
    /// </summary>
    /// <param name="name">The cluster name.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the cluster.</returns>
    internal static async Task<Results<Ok<ClusterDetailDto>, ProblemHttpResult>> GetCluster(
        string name, IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new GetClusterQuery(name), cancellationToken).ConfigureAwait(false)).ToHttpResult();

    /// <summary>
    /// Replaces the cluster's editable settings. Changing the API URL, CA bundle or skip-TLS flag marks earlier
    /// connection tests stale. A stale version fails with 409 Concurrency.Conflict.
    /// </summary>
    /// <param name="name">The cluster name.</param>
    /// <param name="request">The new settings and the cluster's version.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the updated cluster.</returns>
    internal static async Task<Results<Ok<ClusterDetailDto>, ProblemHttpResult>> UpdateCluster(
        string name, UpdateClusterRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var result = await dispatcher.Send(
            new UpdateClusterCommand(
                name,
                request.DisplayName,
                request.ApiUrl,
                request.Environment,
                request.Distribution,
                request.WebConsoleUrl,
                request.Description,
                request.CaBundle,
                request.SkipTlsVerify,
                request.Version),
            cancellationToken).ConfigureAwait(false);
        return await ThenGetClusterAsync(result, name, dispatcher, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Enables a cluster: granted users see it in the switcher again. A stale version fails with 409
    /// Concurrency.Conflict.
    /// </summary>
    /// <param name="name">The cluster name.</param>
    /// <param name="request">The cluster's version.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the updated cluster.</returns>
    internal static async Task<Results<Ok<ClusterDetailDto>, ProblemHttpResult>> EnableCluster(
        string name, VersionRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var result = await dispatcher.Send(new EnableClusterCommand(name, request.Version), cancellationToken).ConfigureAwait(false);
        return await ThenGetClusterAsync(result, name, dispatcher, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Disables a cluster: it disappears from the switcher and access through it stops; credentials and grants are
    /// kept. A stale version fails with 409 Concurrency.Conflict.
    /// </summary>
    /// <param name="name">The cluster name.</param>
    /// <param name="request">The cluster's version.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the updated cluster.</returns>
    internal static async Task<Results<Ok<ClusterDetailDto>, ProblemHttpResult>> DisableCluster(
        string name, VersionRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var result = await dispatcher.Send(new DisableClusterCommand(name, request.Version), cancellationToken).ConfigureAwait(false);
        return await ThenGetClusterAsync(result, name, dispatcher, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Deletes a disabled cluster together with its credentials and grants. Fails with 409 Clusters.NotDisabled while
    /// the cluster is enabled.
    /// </summary>
    /// <param name="name">The cluster name.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>204.</returns>
    internal static async Task<Results<NoContent, ProblemHttpResult>> DeleteCluster(
        string name, IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new DeleteClusterCommand(name), cancellationToken).ConfigureAwait(false)).ToHttpResult();

    // A failed command becomes its ProblemDetails; a successful one is answered with the freshly read cluster
    // (post-commit version, ADR-0013 §5). The route name is the key: the commands never rename a cluster.
    private static async Task<Results<Ok<ClusterDetailDto>, ProblemHttpResult>> ThenGetClusterAsync(
        Result commandResult, string name, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        if (commandResult.IsFailure)
        {
            return commandResult.ToProblemDetails();
        }

        return (await dispatcher.Send(new GetClusterQuery(name), cancellationToken).ConfigureAwait(false)).ToHttpResult();
    }
}
