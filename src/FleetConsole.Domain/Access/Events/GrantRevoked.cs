using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Domain.Access.Events;

/// <summary>
/// An admin revoked a user's or a group's access to a cluster (GRANT-3). Audited as <c>grant.revoked</c>. Not raised
/// when a grant is removed by the cascade of a cluster deletion (that is covered by <c>ClusterDeleted</c>).
/// </summary>
/// <param name="GrantId">The grant's id.</param>
/// <param name="UserId">The user's id; <see langword="null"/> for a group grant.</param>
/// <param name="SubjectName">The user's username, or the group name.</param>
/// <param name="ClusterId">The cluster's id.</param>
/// <param name="ClusterName">The cluster's name.</param>
/// <param name="CredentialId">The credential the grant used.</param>
/// <param name="CredentialName">The name of the credential the grant used.</param>
/// <param name="AccessMode">The access mode the grant had.</param>
/// <param name="SubjectKind">Whether the subject was a user or a group.</param>
/// <param name="Priority">The group grant's priority; <see langword="null"/> for a user grant.</param>
public sealed record GrantRevoked(
    GrantId GrantId,
    UserId? UserId,
    string SubjectName,
    ClusterId ClusterId,
    string ClusterName,
    CredentialId CredentialId,
    string CredentialName,
    AccessMode AccessMode,
    GrantSubjectKind SubjectKind,
    int? Priority) : IDomainEvent;
