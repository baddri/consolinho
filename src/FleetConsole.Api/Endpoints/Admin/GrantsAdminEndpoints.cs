using FleetConsole.Api.Http;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Grants;
using FleetConsole.Application.Grants.BulkGrant;
using FleetConsole.Application.Grants.BulkGroupGrant;
using FleetConsole.Application.Grants.CreateGrant;
using FleetConsole.Application.Grants.CreateGroupGrant;
using FleetConsole.Application.Grants.GetGrant;
using FleetConsole.Application.Grants.GetGrantsByIds;
using FleetConsole.Application.Grants.ListClusterGrants;
using FleetConsole.Application.Grants.ListGroupGrants;
using FleetConsole.Application.Grants.ListUserGrants;
using FleetConsole.Application.Grants.RevokeGrant;
using FleetConsole.Application.Grants.UpdateGrant;
using Microsoft.AspNetCore.Http.HttpResults;

namespace FleetConsole.Api.Endpoints.Admin;

/// <summary>
/// Grant administration (contract §9, GRANT-1..6; CP4.5 contract §2-3 for group grants): <c>/api/admin/grants</c>, the
/// per-user and per-cluster lists, the bulk grant under <c>/api/admin/users/{username}/grants</c> and the group grants
/// under <c>/api/admin/groups/{groupName}/grants</c>.
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
        admin.MapGet("/groups/{groupName}/grants", ListGroupGrants).WithTags("Grants").WithName("ListGroupGrants");
        admin.MapPost("/groups/{groupName}/grants", CreateGroupGrant).WithTags("Grants").WithName("CreateGroupGrant");
        admin.MapPost("/groups/{groupName}/grants/bulk", BulkGroupGrant).WithTags("Grants").WithName("BulkGroupGrant");

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
    /// Lists the user and group grants on a cluster: user grants first, then group grants, each sorted by subject name.
    /// Includes grants of deactivated users and expired credentials. Fails with 404 Clusters.NotFound.
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
    /// Lists a host group's grants sorted by cluster name. A group without grants (or an invalid group name) has none;
    /// there is no 404.
    /// </summary>
    /// <param name="groupName">The host group name (URL-encoded).</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the grants.</returns>
    internal static async Task<Results<Ok<IReadOnlyList<GrantDto>>, ProblemHttpResult>> ListGroupGrants(
        string groupName, IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new ListGroupGrantsQuery(groupName), cancellationToken).ConfigureAwait(false)).ToHttpResult();

    /// <summary>
    /// Gives every member of a host group access to a cluster at a priority. An invalid or system group name, a priority
    /// outside 1-1000, an unknown cluster or credential, or a credential of another cluster are 400 field errors; a second
    /// grant for the group on the cluster is 409 Grants.AlreadyExists, a priority another group holds there 409
    /// Grants.PriorityTaken.
    /// </summary>
    /// <param name="groupName">The host group name (URL-encoded); it need not exist on the host yet.</param>
    /// <param name="request">The grant to create.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>201 with the grant and its Location.</returns>
    internal static async Task<Results<Created<GrantDto>, ProblemHttpResult>> CreateGroupGrant(
        string groupName, CreateGroupGrantRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var created = await dispatcher.Send(
            new CreateGroupGrantCommand(groupName, request.ClusterName, request.CredentialId, request.AccessMode, request.Priority),
            cancellationToken).ConfigureAwait(false);
        if (created.IsFailure)
        {
            return created.ToProblemDetails();
        }

        return (await dispatcher.Send(new GetGrantQuery(created.Value), cancellationToken).ConfigureAwait(false))
            .ToHttpResult(grant => TypedResults.Created($"/api/admin/grants/{grant.Id}", grant));
    }

    /// <summary>
    /// Gives a host group access to several clusters at once with one priority, all or nothing. Item problems (unknown
    /// cluster or credential, credential of another cluster, group already granted, priority taken) are 400 field errors
    /// keyed by the item index (for example items[3].clusterName); then nothing is written.
    /// </summary>
    /// <param name="groupName">The host group name (URL-encoded).</param>
    /// <param name="request">The access mode, priority and the clusters with their credentials.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the created grants, in request order.</returns>
    internal static async Task<Results<Ok<IReadOnlyList<GrantDto>>, ProblemHttpResult>> BulkGroupGrant(
        string groupName, BulkGroupGrantRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var created = await dispatcher.Send(
            new BulkGroupGrantCommand(groupName, request.AccessMode, request.Priority, request.Items),
            cancellationToken).ConfigureAwait(false);
        if (created.IsFailure)
        {
            return created.ToProblemDetails();
        }

        return (await dispatcher.Send(new GetGrantsByIdsQuery(created.Value), cancellationToken).ConfigureAwait(false))
            .ToHttpResult();
    }

    /// <summary>
    /// Changes a grant's access mode and/or credential, and a group grant's priority. An unknown credential or one of
    /// another cluster is a 400 field error on credentialId; a missing priority on a group grant, or any priority on a
    /// user grant, a 400 field error on priority. Fails with 404 Grants.NotFound; a stale version with 409
    /// Concurrency.Conflict; a priority another group holds on the cluster with 409 Grants.PriorityTaken.
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
            new UpdateGrantCommand(grantId, request.AccessMode, request.CredentialId, request.Version, request.Priority),
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
