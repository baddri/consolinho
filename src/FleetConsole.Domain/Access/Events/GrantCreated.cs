using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Domain.Access.Events;

/// <summary>
/// An admin gave a user access to a cluster (GRANT-2, also once per item of a bulk grant, GRANT-4). Audited as
/// <c>grant.created</c> with target name <c>"&lt;username&gt; → &lt;cluster&gt;"</c>.
/// </summary>
/// <param name="GrantId">The new grant's id.</param>
/// <param name="UserId">The granted user's id.</param>
/// <param name="Username">The granted user's username.</param>
/// <param name="ClusterId">The cluster's id.</param>
/// <param name="ClusterName">The cluster's name.</param>
/// <param name="CredentialId">The credential's id.</param>
/// <param name="CredentialName">The credential's name.</param>
/// <param name="AccessMode">The granted access mode.</param>
public sealed record GrantCreated(
    GrantId GrantId,
    UserId UserId,
    string Username,
    ClusterId ClusterId,
    string ClusterName,
    CredentialId CredentialId,
    string CredentialName,
    AccessMode AccessMode) : IDomainEvent;
