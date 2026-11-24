using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Grants.ListGroupGrants;

/// <summary>
/// Lists a host group's grants (group detail, "Cluster access" tab), including grants of disabled clusters and expired
/// credentials (GRANT-5). <c>GET /api/admin/groups/{groupName}/grants</c>; sorted by cluster name (ordinal).
/// </summary>
/// <remarks>
/// Groups live on the host cluster, not in FleetConsole, so there is no "group not found": a name without grants, or one
/// that isn't even a valid group name, simply has none (contract §3).
/// </remarks>
/// <param name="GroupName">The host group from the route.</param>
public sealed record ListGroupGrantsQuery(string GroupName) : IQuery<IReadOnlyList<GrantDto>>, IAdminRequest;
