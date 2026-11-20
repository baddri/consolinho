using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Grants.RevokeGrant;

/// <summary>
/// Removes a user's access to a cluster (GRANT-3). <c>DELETE /api/admin/grants/{grantId}</c>; audited as
/// <c>grant.revoked</c> with what the grant was. Takes no version (contract §9.3). Admin command: refused for read-only
/// admins.
/// </summary>
/// <param name="GrantId">The grant from the route; unknown → <c>Grants.NotFound</c>.</param>
public sealed record RevokeGrantCommand(Guid GrantId) : ICommand, IAdminRequest, IMutatingCommand;
