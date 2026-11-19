using FleetConsole.Domain.Clusters;

namespace FleetConsole.Application.Clusters.GetCluster;

// Returned by GET/PUT /api/admin/clusters/{name}, POST /api/admin/clusters and the enable/disable transitions. Published
// in the OpenAPI document as "ClusterDetail"; the XML docs are written for API consumers.

/// <summary>A registered cluster with all its settings.</summary>
/// <param name="Name">The cluster name: URL slug, unique and immutable.</param>
/// <param name="DisplayName">Human-friendly name; equals the name when none was given.</param>
/// <param name="Environment">Production, staging or development.</param>
/// <param name="ApiUrl">The API server URL (https, host and port, no trailing slash).</param>
/// <param name="WebConsoleUrl">Link to the cluster's own web console, or null.</param>
/// <param name="Description">Free-text description, or null.</param>
/// <param name="CaBundle">The PEM CA bundle used to verify the API server (not secret), or null for the system trust store.</param>
/// <param name="CaCertificates">The certificates of the CA bundle; empty when there is none.</param>
/// <param name="SkipTlsVerify">Whether TLS verification is switched off for this cluster.</param>
/// <param name="TlsMode">How the API server's certificate is verified (derived from the CA bundle and the skip flag).</param>
/// <param name="IsEnabled">Whether granted users see and can use the cluster.</param>
/// <param name="CredentialCount">Number of ServiceAccount credentials stored for the cluster.</param>
/// <param name="GrantCount">Number of users with access (one grant per user and cluster).</param>
/// <param name="ConnectionSettingsChangedAt">When the API URL, CA bundle or skip flag last changed; connection tests from before this time are stale.</param>
/// <param name="CreatedAt">When the cluster was registered.</param>
/// <param name="CreatedBy">Who registered the cluster.</param>
/// <param name="UpdatedAt">When an administrator last changed the cluster, or null.</param>
/// <param name="UpdatedBy">Who last changed the cluster, or null.</param>
/// <param name="Version">Concurrency version; send it back with edits and enable/disable.</param>
public sealed record ClusterDetailDto(
    string Name,
    string DisplayName,
    ClusterEnvironment Environment,
    string ApiUrl,
    string? WebConsoleUrl,
    string? Description,
    string? CaBundle,
    IReadOnlyList<CaCertificateDto> CaCertificates,
    bool SkipTlsVerify,
    ClusterTlsMode TlsMode,
    bool IsEnabled,
    int CredentialCount,
    int GrantCount,
    DateTimeOffset ConnectionSettingsChangedAt,
    DateTimeOffset CreatedAt,
    string CreatedBy,
    DateTimeOffset? UpdatedAt,
    string? UpdatedBy,
    uint Version);
