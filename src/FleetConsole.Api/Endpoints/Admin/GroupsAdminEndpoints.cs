using FleetConsole.Api.Http;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Groups.GetGroup;
using FleetConsole.Application.Groups.ListGroups;
using Microsoft.AspNetCore.Http.HttpResults;

namespace FleetConsole.Api.Endpoints.Admin;

/// <summary>
/// <c>/api/admin/groups</c>: the Groups list and Group detail (contract CP4.5a §4, GPG-1/2/4, UIG-2), combining the host
/// cluster's groups (read with FleetConsole's host service account, ADR-0039) with FleetConsole's group grants.
/// </summary>
/// <remarks>
/// The grant routes under a group (<c>/groups/{groupName}/grants*</c>) are mapped by
/// <see cref="GrantsAdminEndpoints"/> with full paths on the admin group; this file only adds the two reads, so no
/// route is registered twice. Both are side-effect free GETs (no audit).
/// </remarks>
public static class GroupsAdminEndpoints
{
    /// <summary>Maps the group endpoints into the <c>/api/admin</c> group.</summary>
    /// <param name="admin">The <c>/api/admin</c> group.</param>
    /// <returns>The <c>/api/admin/groups</c> group.</returns>
    public static RouteGroupBuilder MapGroupsAdminEndpoints(this RouteGroupBuilder admin)
    {
        ArgumentNullException.ThrowIfNull(admin);

        var groups = admin.MapGroup("/groups").WithTags("Groups");

        groups.MapGet("", ListGroups).WithName("ListGroups");
        groups.MapGet("/{groupName}", GetGroup).WithName("GetGroup");

        return groups;
    }

    // XML docs on the handlers are published as OpenAPI summaries (written for API consumers); implementation notes are
    // in // comments.

    /// <summary>
    /// Lists the host cluster's groups and the groups named in grants, sorted by name, without system groups. Answers 200
    /// even when the host groups can't be read (hostStatus forbidden or unavailable); then only groups known from grants
    /// are listed and host facts are null.
    /// </summary>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the groups.</returns>
    internal static async Task<Results<Ok<GroupListDto>, ProblemHttpResult>> ListGroups(
        IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new ListGroupsQuery(), cancellationToken).ConfigureAwait(false)).ToHttpResult();

    /// <summary>
    /// Gets a group with its host members, each marked when a FleetConsole user of that name exists. Fails with 404
    /// Groups.NotFound when the name is invalid, or when the host groups were read, the group isn't on the host and has
    /// no grants.
    /// </summary>
    /// <param name="groupName">The OpenShift group name.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the group, or 404.</returns>
    internal static async Task<Results<Ok<GroupDetailDto>, ProblemHttpResult>> GetGroup(
        string groupName, IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new GetGroupQuery(groupName), cancellationToken).ConfigureAwait(false)).ToHttpResult();
}
