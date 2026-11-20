using FleetConsole.Application.Common;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Grants;

// Returned by the grant endpoints (contract §9.1). Published in the OpenAPI document as the "Grant" schema; the XML docs
// below are written for API consumers. Built by GrantProjection; it never contains token data (CRED-2).

/// <summary>
/// A user's access to one cluster through a ServiceAccount credential, with the state of user, cluster and credential
/// so the UI can mark grants of deactivated users, disabled clusters and expired credentials.
/// </summary>
/// <param name="Id">The grant id.</param>
/// <param name="Username">The granted user.</param>
/// <param name="UserDisplayName">The granted user's display name, if known.</param>
/// <param name="UserStatus">The granted user's status; grants of deactivated users are kept.</param>
/// <param name="ClusterName">The cluster the grant gives access to.</param>
/// <param name="ClusterDisplayName">The cluster's display name.</param>
/// <param name="ClusterEnvironment">The cluster's environment.</param>
/// <param name="ClusterIsEnabled">Whether the cluster is enabled; grants of disabled clusters are kept.</param>
/// <param name="CredentialId">The credential whose token is used for this user on the cluster.</param>
/// <param name="CredentialName">The credential's name.</param>
/// <param name="CredentialExpiryStatus">The credential's expiry state now.</param>
/// <param name="CredentialExpiresAt">When the credential's token expires; null when it has no expiry or it is unknown.</param>
/// <param name="CredentialLastTest">The last connection test of the credential's current token; null when not tested.</param>
/// <param name="AccessMode">Whether the user may change resources on the cluster.</param>
/// <param name="GrantedAt">When the grant was created.</param>
/// <param name="GrantedBy">Who created the grant.</param>
/// <param name="UpdatedAt">When the grant was last changed; null if never.</param>
/// <param name="UpdatedBy">Who last changed the grant; null if never.</param>
/// <param name="Version">Concurrency version; send it back when changing the grant.</param>
public sealed record GrantDto(
    Guid Id,
    string Username,
    string? UserDisplayName,
    UserStatus UserStatus,
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
