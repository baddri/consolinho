using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Domain.Access.Events;

/// <summary>
/// An admin changed a grant's access mode and/or credential (GRANT-3). Audited as <c>grant.changed</c>. Only raised
/// when something changed.
/// </summary>
/// <param name="GrantId">The grant's id.</param>
/// <param name="UserId">The granted user's id.</param>
/// <param name="Username">The granted user's username.</param>
/// <param name="ClusterId">The cluster's id.</param>
/// <param name="ClusterName">The cluster's name.</param>
/// <param name="OldAccessMode">The access mode before the change.</param>
/// <param name="NewAccessMode">The access mode after the change.</param>
/// <param name="OldCredentialId">The credential before the change.</param>
/// <param name="OldCredentialName">The name of the credential before the change.</param>
/// <param name="NewCredentialId">The credential after the change.</param>
/// <param name="NewCredentialName">The name of the credential after the change.</param>
public sealed record GrantChanged(
    GrantId GrantId,
    UserId UserId,
    string Username,
    ClusterId ClusterId,
    string ClusterName,
    AccessMode OldAccessMode,
    AccessMode NewAccessMode,
    CredentialId OldCredentialId,
    string OldCredentialName,
    CredentialId NewCredentialId,
    string NewCredentialName) : IDomainEvent;
