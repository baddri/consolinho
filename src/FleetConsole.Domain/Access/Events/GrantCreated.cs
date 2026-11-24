using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Domain.Access.Events;

/// <summary>
/// An admin gave a user or a host group access to a cluster (GRANT-2, GRP-1; also once per item of a bulk grant,
/// GRANT-4). Audited as <c>grant.created</c> with target name <c>"&lt;username&gt; → &lt;cluster&gt;"</c> or
/// <c>"group &lt;group&gt; → &lt;cluster&gt;"</c> (GRP-7).
/// </summary>
/// <param name="GrantId">The new grant's id.</param>
/// <param name="UserId">The granted user's id; <see langword="null"/> for a group grant.</param>
/// <param name="SubjectName">The granted user's username, or the group name.</param>
/// <param name="ClusterId">The cluster's id.</param>
/// <param name="ClusterName">The cluster's name.</param>
/// <param name="CredentialId">The credential's id.</param>
/// <param name="CredentialName">The credential's name.</param>
/// <param name="AccessMode">The granted access mode.</param>
/// <param name="SubjectKind">Whether the subject is a user or a group.</param>
/// <param name="Priority">The group grant's priority; <see langword="null"/> for a user grant.</param>
public sealed record GrantCreated(
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
