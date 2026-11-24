using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Access;

namespace FleetConsole.Application.Grants.CreateGroupGrant;

/// <summary>
/// Gives every member of a host group access to a cluster through one of the cluster's credentials, at a priority
/// among the cluster's group grants (GRP-1..6). <c>POST /api/admin/groups/{groupName}/grants</c>; audited as
/// <c>grant.created</c>. Returns the new grant's id; the endpoint then reads it with <c>GetGrantQuery</c>.
/// </summary>
/// <remarks>
/// The group is free text (it need not exist on the host yet), so an invalid or <c>system:</c> name is a 400 field
/// error on <c>groupName</c>, never a 404. Unknown cluster or credential and a credential of another cluster are 400
/// field errors like <c>CreateGrantCommand</c>; a second grant for the group on the cluster is 409
/// <c>Grants.AlreadyExists</c> and a priority another group holds there is 409 <c>Grants.PriorityTaken</c>. Admin
/// command: refused for read-only admins.
/// </remarks>
/// <param name="GroupName">The host group from the route.</param>
/// <param name="ClusterName">The cluster.</param>
/// <param name="CredentialId">The credential to use; must belong to the cluster.</param>
/// <param name="AccessMode">The access mode.</param>
/// <param name="Priority">The rank among the cluster's group grants, 1-1000 (higher wins); unique per cluster.</param>
public sealed record CreateGroupGrantCommand(
    string GroupName, string ClusterName, Guid CredentialId, AccessMode AccessMode, int Priority)
    : ICommand<Guid>, IAdminRequest, IMutatingCommand;
