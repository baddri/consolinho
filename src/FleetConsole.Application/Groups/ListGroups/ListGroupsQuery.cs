using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Groups.ListGroups;

/// <summary>
/// Lists the groups for the Fleet administration Groups list (GPG-1) and the grant modal's group typeahead (UIG-2,
/// filtered client-side): host groups ∪ groups named in group grants, <c>system:*</c> excluded, sorted by name (ordinal).
/// <c>GET /api/admin/groups</c>.
/// </summary>
/// <remarks>
/// <para>Never fails because of the host: a host that can't be read gives <see cref="GroupListDto.HostStatus"/> ≠
/// <c>ok</c> and only the grant-only rows (GPG-4, Q7). Side-effect free (a GET: no audit, CSRF rule).</para>
/// <para>Readable by read-only admins: an <see cref="IAdminRequest"/>, not an <see cref="IMutatingCommand"/>.</para>
/// </remarks>
public sealed record ListGroupsQuery : IQuery<GroupListDto>, IAdminRequest;
