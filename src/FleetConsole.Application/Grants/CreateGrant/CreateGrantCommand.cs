using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Access;

namespace FleetConsole.Application.Grants.CreateGrant;

/// <summary>
/// Gives a user access to a cluster through one of the cluster's credentials (GRANT-1/2). <c>POST /api/admin/grants</c>;
/// audited as <c>grant.created</c>. Returns the new grant's id; the endpoint then reads it with <c>GetGrantQuery</c>.
/// </summary>
/// <remarks>
/// Unknown user, cluster or credential and a credential of another cluster are 400 field errors (contract §9.3); a
/// second grant for the same user and cluster is 409 <c>Grants.AlreadyExists</c>. Allowed for deactivated users and
/// disabled clusters (GRANT-5). Admin command: refused for read-only admins.
/// </remarks>
/// <param name="Username">The user to grant access to.</param>
/// <param name="ClusterName">The cluster.</param>
/// <param name="CredentialId">The credential to use; must belong to the cluster.</param>
/// <param name="AccessMode">The access mode.</param>
public sealed record CreateGrantCommand(string Username, string ClusterName, Guid CredentialId, AccessMode AccessMode)
    : ICommand<Guid>, IAdminRequest, IMutatingCommand;
