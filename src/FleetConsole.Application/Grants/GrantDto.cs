using FleetConsole.Application.Common;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Grants;

// Returned by the grant endpoints (contract §9.1). Published in the OpenAPI document as the "Grant" schema; the XML docs
// below are written for API consumers. Built by GrantProjection; it never contains token data (CRED-2).

/// <summary>
/// A user's or a host group's access to one cluster through a ServiceAccount credential, with the state of user, cluster
/// and credential so the UI can mark grants of deactivated users, disabled clusters and expired credentials.
/// </summary>
/// <param name="Id">The grant id.</param>
/// <param name="SubjectKind">Whether the grant is for one user or for every member of a host group.</param>
/// <param name="SubjectName">The username or the group name; always set.</param>
/// <param name="Priority">The group grant's priority (1-1000, higher wins among a user's groups); null for user grants.</param>
/// <param name="Username">The granted user; null for group grants.</param>
/// <param name="UserDisplayName">The granted user's display name, if known; null for group grants.</param>
/// <param name="UserStatus">The granted user's status (grants of deactivated users are kept); null for group grants.</param>
/// <param name="ClusterName">The cluster the grant gives access to.</param>
/// <param name="ClusterDisplayName">The cluster's display name.</param>
/// <param name="ClusterEnvironment">The cluster's environment.</param>
/// <param name="ClusterIsEnabled">Whether the cluster is enabled; grants of disabled clusters are kept.</param>
/// <param name="CredentialId">The credential whose token is used for the subject on the cluster.</param>
/// <param name="CredentialName">The credential's name.</param>
/// <param name="CredentialExpiryStatus">The credential's expiry state now.</param>
/// <param name="CredentialExpiresAt">When the credential's token expires; null when it has no expiry or it is unknown.</param>
/// <param name="CredentialLastTest">The last connection test of the credential's current token; null when not tested.</param>
/// <param name="AccessMode">Whether the subject may change resources on the cluster.</param>
/// <param name="GrantedAt">When the grant was created.</param>
/// <param name="GrantedBy">Who created the grant.</param>
/// <param name="UpdatedAt">When the grant was last changed; null if never.</param>
/// <param name="UpdatedBy">Who last changed the grant; null if never.</param>
/// <param name="Version">Concurrency version; send it back when changing the grant.</param>
public sealed record GrantDto(
    Guid Id,
    GrantSubjectKind SubjectKind,
    string SubjectName,
    int? Priority,
    string? Username,
    string? UserDisplayName,
    UserStatus? UserStatus,
    string ClusterName,
    string ClusterDisplayName,
    ClusterEnvironment ClusterEnvironment,
    bool ClusterIsEnabled,
    Guid CredentialId,
    string CredentialName,
    CredentialExpiryStatus CredentialExpiryStatus,
    DateTimeOffset? CredentialExpiresAt,
    ConnectionTestSummaryDto? CredentialLastTest,
    AccessMode AccessMode,
    DateTimeOffset GrantedAt,
    string GrantedBy,
    DateTimeOffset? UpdatedAt,
    string? UpdatedBy,
    uint Version);
