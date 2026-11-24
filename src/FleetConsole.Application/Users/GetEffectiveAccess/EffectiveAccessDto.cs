using FleetConsole.Domain.Access;
using FleetConsole.Domain.Access.Resolution;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Users.GetEffectiveAccess;

// Returned by GET /api/admin/users/{username}/effective-access. Published in the OpenAPI document as the
// "EffectiveAccess", "EffectiveClusterAccess", "AccessSource" and "AccessCandidate" schemas (contract CP4.5a §5); the
// XML docs below are written for API consumers.

/// <summary>A user's effective access to every cluster they can open, and why.</summary>
/// <param name="Username">The OpenShift username.</param>
/// <param name="UserIsReadOnly">The user's stored read-only flag; it narrows every read-write grant to read-only.</param>
/// <param name="UserStatus">The user's status.</param>
/// <param name="Groups">The user's recorded host group membership (system:* groups are never recorded).</param>
/// <param name="GroupsAsOf">When the membership was last read: the later of the last login and the last revalidation
/// check; null if the user never logged in.</param>
/// <param name="Clusters">The clusters the user can open (enabled, with a winning grant), sorted by cluster name;
/// empty for a deactivated user.</param>
public sealed record EffectiveAccessDto(
    string Username,
    bool UserIsReadOnly,
    UserStatus UserStatus,
    IReadOnlyList<string> Groups,
    DateTimeOffset? GroupsAsOf,
    IReadOnlyList<EffectiveClusterAccessDto> Clusters);

/// <summary>The user's effective access to one cluster.</summary>
/// <param name="ClusterName">The cluster's name.</param>
/// <param name="ClusterDisplayName">The cluster's display name.</param>
/// <param name="ClusterEnvironment">The cluster's environment.</param>
/// <param name="AccessMode">The effective mode, after the user's read-only flag.</param>
/// <param name="NarrowedByReadOnlyFlag">True when the winning grant is read-write but the user's read-only flag made
/// the access read-only.</param>
/// <param name="Source">Where the access comes from: a direct grant, or a group grant with its priority.</param>
/// <param name="CredentialId">The winning grant's credential, used for every request to this cluster.</param>
/// <param name="CredentialName">The winning grant's credential name.</param>
/// <param name="Candidates">Every grant that matches the user on this cluster: the winner first, then group grants by
/// priority (highest first).</param>
public sealed record EffectiveClusterAccessDto(
    string ClusterName,
    string ClusterDisplayName,
    ClusterEnvironment ClusterEnvironment,
    AccessMode AccessMode,
    bool NarrowedByReadOnlyFlag,
    AccessSourceDto Source,
    Guid CredentialId,
    string CredentialName,
    IReadOnlyList<AccessCandidateDto> Candidates);

/// <summary>The grant an effective access comes from.</summary>
/// <param name="Kind">user for a direct grant, group for a group grant.</param>
/// <param name="GroupName">The group's name; null for a direct grant.</param>
/// <param name="Priority">The group grant's priority; null for a direct grant.</param>
public sealed record AccessSourceDto(GrantSubjectKind Kind, string? GroupName, int? Priority);

/// <summary>One grant that matches the user on the cluster, and whether (and why not) it applies.</summary>
/// <param name="GrantId">The grant's id.</param>
/// <param name="SubjectKind">user for a direct grant, group for a group grant.</param>
/// <param name="SubjectName">The username (direct grant) or the group name.</param>
/// <param name="Priority">The group grant's priority; null for a direct grant.</param>
/// <param name="AccessMode">The grant's own mode (before the user's read-only flag).</param>
/// <param name="CredentialName">The grant's credential name.</param>
/// <param name="Outcome">winner; overriddenByDirectGrant (a direct grant always wins); lowerPriority (a higher
/// priority group grant wins); tieReadOnlyWins (same priority, the read-only grant wins); tieBrokenById (same priority
/// and mode, the older grant wins — not expected, priorities are unique per cluster).</param>
/// <param name="BeatenBy">For lowerPriority and tie outcomes, the winning group's name; otherwise null.</param>
public sealed record AccessCandidateDto(
    Guid GrantId,
    GrantSubjectKind SubjectKind,
    string SubjectName,
    int? Priority,
    AccessMode AccessMode,
    string CredentialName,
    CandidateOutcome Outcome,
    string? BeatenBy);
