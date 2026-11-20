using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Domain.Access.Events;

/// <summary>
/// An admin revoked a user's access to a cluster (GRANT-3). Audited as <c>grant.revoked</c>. Not raised when a grant is
/// removed by the cascade of a cluster deletion (that is covered by <c>ClusterDeleted</c>).
/// </summary>
/// <param name="GrantId">The grant's id.</param>
/// <param name="UserId">The user's id.</param>
/// <param name="Username">The user's username.</param>
/// <param name="ClusterId">The cluster's id.</param>
/// <param name="ClusterName">The cluster's name.</param>
/// <param name="CredentialId">The credential the grant used.</param>
/// <param name="CredentialName">The name of the credential the grant used.</param>
/// <param name="AccessMode">The access mode the grant had.</param>
public sealed record GrantRevoked(
    GrantId GrantId,
    UserId UserId,
    string Username,
    ClusterId ClusterId,
    string ClusterName,
    CredentialId CredentialId,
    string CredentialName,
    AccessMode AccessMode) : IDomainEvent;
