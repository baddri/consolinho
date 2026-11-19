using FleetConsole.Api.Http;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Grants;
using FleetConsole.Application.Grants.BulkGrant;
using FleetConsole.Application.Grants.CreateGrant;
using FleetConsole.Application.Grants.GetGrant;
using FleetConsole.Application.Grants.GetGrantsByIds;
using FleetConsole.Application.Grants.ListClusterGrants;
using FleetConsole.Application.Grants.ListUserGrants;
using FleetConsole.Application.Grants.RevokeGrant;
using FleetConsole.Application.Grants.UpdateGrant;
using Microsoft.AspNetCore.Http.HttpResults;

namespace FleetConsole.Api.Endpoints.Admin;

/// <summary>
/// Grant administration (contract §9, GRANT-1..6): <c>/api/admin/grants</c>, the per-user and per-cluster lists and the
/// bulk grant under <c>/api/admin/users/{username}/grants</c>.
/// </summary>
/// <remarks>
/// <b>Commands return keys, endpoints re-query</b> (ADR-0013 §5): create, update and bulk dispatch
/// <see cref="GetGrantQuery"/> / <see cref="GetGrantsByIdsQuery"/> after the commit, so responses carry the post-commit
/// <c>version</c>. Grants reference credentials by id and name only; no token data is ever part of a response.
/// </remarks>
public static class GrantsAdminEndpoints
{
    /// <summary>Maps the grant endpoints into the <c>/api/admin</c> group.</summary>
    /// <param name="admin">The <c>/api/admin</c> group.</param>
    /// <returns>The <c>/api/admin/grants</c> group.</returns>
    public static RouteGroupBuilder MapGrantsAdminEndpoints(this RouteGroupBuilder admin)
    {
        ArgumentNullException.ThrowIfNull(admin);

        admin.MapGet("/users/{username}/grants", ListUserGrants).WithTags("Grants").WithName("ListUserGrants");
        admin.MapPost("/users/{username}/grants/bulk", BulkGrant).WithTags("Grants").WithName("BulkGrant");
        admin.MapGet("/clusters/{name}/grants", ListClusterGrants).WithTags("Grants").WithName("ListClusterGrants");

        var grants = admin.MapGroup("/grants").WithTags("Grants");
        grants.MapPost("", CreateGrant).WithName("CreateGrant");
        grants.MapPut("/{grantId:guid}", UpdateGrant).WithName("UpdateGrant");
        grants.MapDelete("/{grantId:guid}", RevokeGrant).WithName("RevokeGrant");

        return grants;
    }

    // XML docs on the handlers are published as OpenAPI summaries (written for API consumers); implementation notes are
    // in // comments.

    /// <summary>
    /// Lists a user's grants sorted by cluster name, including grants of disabled clusters and expired credentials.
    /// Fails with 404 Users.NotFound.
    /// </summary>
    /// <param name="username">The username.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the grants.</returns>
    internal static async Task<Results<Ok<IReadOnlyList<GrantDto>>, ProblemHttpResult>> ListUserGrants(
        string username, IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new ListUserGrantsQuery(username), cancellationToken).ConfigureAwait(false)).ToHttpResult();

    /// <summary>
    /// Lists the grants on a cluster sorted by username, including grants of deactivated users and expired credentials.
    /// Fails with 404 Clusters.NotFound.
    /// </summary>
    /// <param name="name">The cluster name.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the grants.</returns>
    internal static async Task<Results<Ok<IReadOnlyList<GrantDto>>, ProblemHttpResult>> ListClusterGrants(
        string name, IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new ListClusterGrantsQuery(name), cancellationToken).ConfigureAwait(false)).ToHttpResult();

    /// <summary>
    /// Gives a user access to a cluster through one of its credentials. Unknown user, cluster or credential, or a
    /// credential of another cluster, are 400 field errors; a second grant for the same user and cluster is 409
    /// Grants.AlreadyExists.
    /// </summary>
    /// <param name="request">The grant to create.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>201 with the grant and its Location.</returns>
    internal static async Task<Results<Created<GrantDto>, ProblemHttpResult>> CreateGrant(
        CreateGrantRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var created = await dispatcher.Send(
            new CreateGrantCommand(request.Username, request.ClusterName, request.CredentialId, request.AccessMode),
            cancellationToken).ConfigureAwait(false);
        if (created.IsFailure)
        {
            return created.ToProblemDetails();
        }

        return (await dispatcher.Send(new GetGrantQuery(created.Value), cancellationToken).ConfigureAwait(false))
            .ToHttpResult(grant => TypedResults.Created($"/api/admin/grants/{grant.Id}", grant));
    }

    /// <summary>
    /// Gives a user access to several clusters at once, all or nothing. Item problems are 400 field errors keyed by the
    /// item index (for example items[3].clusterName); then nothing is written. Fails with 404 Users.NotFound.
    /// </summary>
    /// <param name="username">The username.</param>
    /// <param name="request">The access mode and the clusters with their credentials.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the created grants, in request order.</returns>
    internal static async Task<Results<Ok<IReadOnlyList<GrantDto>>, ProblemHttpResult>> BulkGrant(
        string username, BulkGrantRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var created = await dispatcher.Send(
            new BulkGrantCommand(username, request.AccessMode, request.Items), cancellationToken).ConfigureAwait(false);
        if (created.IsFailure)
        {
            return created.ToProblemDetails();
        }

        return (await dispatcher.Send(new GetGrantsByIdsQuery(created.Value), cancellationToken).ConfigureAwait(false))
            .ToHttpResult();
    }

    /// <summary>
    /// Changes a grant's access mode and/or credential. An unknown credential or one of another cluster is a 400 field
    /// error on credentialId. Fails with 404 Grants.NotFound; a stale version with 409 Concurrency.Conflict.
    /// </summary>
    /// <param name="grantId">The grant id.</param>
    /// <param name="request">The new mode and credential, and the grant's version.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the updated grant.</returns>
    internal static async Task<Results<Ok<GrantDto>, ProblemHttpResult>> UpdateGrant(
        Guid grantId, UpdateGrantRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var updated = await dispatcher.Send(
            new UpdateGrantCommand(grantId, request.AccessMode, request.CredentialId, request.Version),
            cancellationToken).ConfigureAwait(false);
        if (updated.IsFailure)
        {
            return updated.ToProblemDetails();
        }

        return (await dispatcher.Send(new GetGrantQuery(grantId), cancellationToken).ConfigureAwait(false)).ToHttpResult();
    }

    /// <summary>Revokes a grant; takes no version. Fails with 404 Grants.NotFound.</summary>
    /// <param name="grantId">The grant id.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>204.</returns>
    internal static async Task<Results<NoContent, ProblemHttpResult>> RevokeGrant(
        Guid grantId, IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new RevokeGrantCommand(grantId), cancellationToken).ConfigureAwait(false)).ToHttpResult();
}
