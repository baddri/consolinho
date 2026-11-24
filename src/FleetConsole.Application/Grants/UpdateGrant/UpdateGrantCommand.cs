using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Access;

namespace FleetConsole.Application.Grants.UpdateGrant;

/// <summary>
/// Changes a grant's access mode and/or credential (GRANT-3), and a group grant's priority (GRP-4). <c>PUT /api/admin/grants/{grantId}</c>; audited as
/// <c>grant.changed</c> with old and new values, or not at all when nothing changes. The endpoint then reads the grant
/// with <c>GetGrantQuery</c>.
/// </summary>
/// <remarks>
/// User and cluster of a grant never change (moving access is revoke + create). An unknown credential or one of another
/// cluster is a 400 field error on <c>credentialId</c>. <see cref="Priority"/> is required for group grants (taken by
/// another group: 409 <c>Grants.PriorityTaken</c>) and must be absent for user grants; both are 400 field errors on
/// <c>priority</c> otherwise. Admin command: refused for read-only admins.
/// </remarks>
/// <param name="GrantId">The grant from the route; unknown → <c>Grants.NotFound</c>.</param>
/// <param name="AccessMode">The requested access mode.</param>
/// <param name="CredentialId">The requested credential (may be the current one).</param>
/// <param name="Version">The grant's version from its last representation; stale → <c>Concurrency.Conflict</c>.</param>
/// <param name="Priority">The requested priority of a group grant (1-1000); <see langword="null"/> for a user grant.</param>
public sealed record UpdateGrantCommand(Guid GrantId, AccessMode AccessMode, Guid CredentialId, uint Version, int? Priority = null)
    : ICommand, IAdminRequest, IMutatingCommand;
