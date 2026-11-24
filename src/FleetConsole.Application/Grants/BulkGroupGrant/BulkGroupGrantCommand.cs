using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Grants.BulkGrant;
using FleetConsole.Domain.Access;

namespace FleetConsole.Application.Grants.BulkGroupGrant;

/// <summary>
/// Gives one host group access to several clusters at once with one access mode and one priority, all or nothing
/// (GPG-3). <c>POST /api/admin/groups/{groupName}/grants/bulk</c>; one <c>grant.created</c> audit entry per created
/// grant. Returns the new grants' ids in request order; the endpoint then reads them with <c>GetGrantsByIdsQuery</c>.
/// </summary>
/// <remarks>
/// Every item problem (unknown cluster or credential, credential of another cluster, group already granted, priority
/// taken on that cluster) is a 400 field error keyed by the item's index, all reported together; then nothing is
/// written (contract §3). The group name and priority are checked like <c>CreateGroupGrantCommand</c>. Admin command:
/// refused for read-only admins.
/// </remarks>
/// <param name="GroupName">The host group from the route.</param>
/// <param name="AccessMode">The access mode of every created grant.</param>
/// <param name="Priority">The priority of every created grant, 1-1000; must be free on every item's cluster.</param>
/// <param name="Items">1 to <see cref="BulkGrantCommand.MaxItems"/> clusters with the credential to use on each;
/// cluster names unique.</param>
public sealed record BulkGroupGrantCommand(
    string GroupName, AccessMode AccessMode, int Priority, IReadOnlyList<BulkGrantItem> Items)
    : ICommand<IReadOnlyList<Guid>>, IAdminRequest, IMutatingCommand;
