using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Groups.GetGroup;

/// <summary>
/// Loads one group for the Group detail page (GPG-2): host facts, grant count and the host members, each marked when a
/// FleetConsole user of that name exists. <c>GET /api/admin/groups/{groupName}</c>; the "Cluster access" tab is
/// <c>ListGroupGrantsQuery</c>.
/// </summary>
/// <remarks>
/// Fails with <see cref="GroupErrors.NotFound"/> when the name is invalid, or when the host listing is ok, the group
/// isn't on the host and no grant names it. A host that can't be read never fails the query (GPG-4).
/// </remarks>
/// <param name="GroupName">The group name from the route.</param>
public sealed record GetGroupQuery(string GroupName) : IQuery<GroupDetailDto>, IAdminRequest;
