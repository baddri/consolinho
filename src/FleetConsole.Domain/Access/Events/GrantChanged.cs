using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Domain.Access.Events;

/// <summary>
/// An admin changed a grant's access mode, credential and/or (group grants) priority (GRANT-3, GRP-4). Audited as
/// <c>grant.changed</c>. Only raised when something changed.
/// </summary>
/// <param name="GrantId">The grant's id.</param>
/// <param name="UserId">The granted user's id; <see langword="null"/> for a group grant.</param>
/// <param name="SubjectName">The granted user's username, or the group name.</param>
/// <param name="ClusterId">The cluster's id.</param>
/// <param name="ClusterName">The cluster's name.</param>
/// <param name="OldAccessMode">The access mode before the change.</param>
/// <param name="NewAccessMode">The access mode after the change.</param>
/// <param name="OldCredentialId">The credential before the change.</param>
/// <param name="OldCredentialName">The name of the credential before the change.</param>
/// <param name="NewCredentialId">The credential after the change.</param>
/// <param name="NewCredentialName">The name of the credential after the change.</param>
/// <param name="SubjectKind">Whether the subject is a user or a group.</param>
/// <param name="OldPriority">The group grant's priority before the change; <see langword="null"/> for a user grant.</param>
/// <param name="NewPriority">The group grant's priority after the change; <see langword="null"/> for a user grant.</param>
public sealed record GrantChanged(
    GrantId GrantId,
    UserId? UserId,
    string SubjectName,
    ClusterId ClusterId,
    string ClusterName,
    AccessMode OldAccessMode,
    AccessMode NewAccessMode,
    CredentialId OldCredentialId,
    string OldCredentialName,
    CredentialId NewCredentialId,
    string NewCredentialName,
    GrantSubjectKind SubjectKind,
    int? OldPriority,
    int? NewPriority) : IDomainEvent;
