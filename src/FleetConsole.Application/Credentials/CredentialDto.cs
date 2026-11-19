using FleetConsole.Application.Common;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Credentials;

// Returned by the credential endpoints (contract §8.3). Published in the OpenAPI document as the "Credential" schema;
// the XML docs below are written for API consumers. Built by CredentialProjection; the token itself is never part of it.

/// <summary>
/// A ServiceAccount credential of a cluster: safe metadata only. The token is write-only and never returned.
/// </summary>
/// <param name="Id">The credential id.</param>
/// <param name="ClusterName">The name of the credential's cluster.</param>
/// <param name="ClusterDisplayName">The display name of the credential's cluster.</param>
/// <param name="ClusterEnvironment">The environment of the credential's cluster.</param>
/// <param name="ClusterIsEnabled">Whether the credential's cluster is enabled.</param>
/// <param name="Name">The credential name, unique within its cluster.</param>
/// <param name="Description">Optional description.</param>
/// <param name="Fingerprint">Short identifier of the current token: the first 8 lowercase hex characters of its SHA-256.</param>
/// <param name="TokenType">Whether the token is a JWT (identity and expiry known) or opaque (unknown).</param>
/// <param name="ServiceAccount">The ServiceAccount as "namespace/name" when the token's subject is a ServiceAccount; otherwise null.</param>
/// <param name="Subject">The token's raw subject claim; null for opaque tokens or when absent.</param>
/// <param name="IssuedAt">When the token was issued (JWT iat), if known. Read without signature validation.</param>
/// <param name="ExpiresAt">When the token expires (JWT exp); null when it has no expiry or it is unknown.</param>
/// <param name="ExpiryStatus">The expiry state now; expiringSoon means within expiryWarningDays.</param>
/// <param name="ExpiryWarningDays">The configured "expiring soon" window in days.</param>
/// <param name="CreatedAt">When the credential was added.</param>
/// <param name="CreatedBy">Who added the credential.</param>
/// <param name="RotatedAt">When the token was last rotated; null if never.</param>
/// <param name="RotatedBy">Who last rotated the token; null if never.</param>
/// <param name="LastTest">The last connection test of the current token; null when it was not tested since it was added or rotated.</param>
/// <param name="GrantCount">How many grants use this credential.</param>
/// <param name="ReadWriteGrantCount">How many of those grants are read-write.</param>
/// <param name="Version">Concurrency version; send it back when rotating the token.</param>
public sealed record CredentialDto(
    Guid Id,
    string ClusterName,
    string ClusterDisplayName,
    ClusterEnvironment ClusterEnvironment,
    bool ClusterIsEnabled,
    string Name,
    string? Description,
    string Fingerprint,
    TokenType TokenType,
    string? ServiceAccount,
    string? Subject,
    DateTimeOffset? IssuedAt,
    DateTimeOffset? ExpiresAt,
    CredentialExpiryStatus ExpiryStatus,
    int ExpiryWarningDays,
    DateTimeOffset CreatedAt,
    string CreatedBy,
    DateTimeOffset? RotatedAt,
    string? RotatedBy,
    ConnectionTestSummaryDto? LastTest,
    int GrantCount,
    int ReadWriteGrantCount,
    uint Version);
