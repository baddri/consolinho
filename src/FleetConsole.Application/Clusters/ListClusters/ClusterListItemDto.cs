using FleetConsole.Application.Common;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Clusters.ListClusters;

// Returned by GET /api/admin/clusters. Published in the OpenAPI document as "ClusterListItem"; the XML docs are written
// for API consumers.

/// <summary>A row of the administration cluster list.</summary>
/// <param name="Name">The cluster name: URL slug, unique and immutable.</param>
/// <param name="DisplayName">Human-friendly name; equals the name when none was given.</param>
/// <param name="Environment">Production, staging or development.</param>
/// <param name="ApiUrl">The API server URL (https, host and port, no trailing slash).</param>
/// <param name="IsEnabled">Whether granted users see and can use the cluster.</param>
/// <param name="TlsMode">How the API server's certificate is verified; skipVerify should be flagged.</param>
/// <param name="CredentialCount">Number of ServiceAccount credentials stored for the cluster.</param>
/// <param name="WorstCredentialExpiryStatus">The most severe token expiry status among the credentials (expired, expiringSoon, unknown, noExpiry, ok, in that order); null when the cluster has no credentials.</param>
/// <param name="GrantCount">Number of users with access (one grant per user and cluster).</param>
/// <param name="LastTest">The newest connection test result across the cluster's credentials, or null when none was tested.</param>
/// <param name="LastTestCredentialName">The credential that newest test ran with, or null.</param>
/// <param name="Version">Concurrency version; send it back with enable/disable.</param>
public sealed record ClusterListItemDto(
    string Name,
    string DisplayName,
    ClusterEnvironment Environment,
    string ApiUrl,
    bool IsEnabled,
    ClusterTlsMode TlsMode,
    int CredentialCount,
    CredentialExpiryStatus? WorstCredentialExpiryStatus,
    int GrantCount,
    ConnectionTestSummaryDto? LastTest,
    string? LastTestCredentialName,
    uint Version);
