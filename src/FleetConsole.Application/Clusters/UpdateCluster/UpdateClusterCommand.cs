using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Clusters;

namespace FleetConsole.Application.Clusters.UpdateCluster;

/// <summary>
/// Replaces every editable setting of a cluster (CLU-4, contract §8.2 <c>PUT /api/admin/clusters/{name}</c>); the name
/// is immutable. Changing the API URL, CA bundle or skip flag marks earlier connection tests stale. Identical values
/// change nothing and write no audit entry, but still succeed. The endpoint answers with <c>GetClusterQuery</c>.
/// Audited as <c>cluster.updated</c> with the changed field names (never CA content).
/// </summary>
/// <param name="Name">The cluster name from the route.</param>
/// <param name="DisplayName">Display name; blank defaults to the name.</param>
/// <param name="ApiUrl">The API server URL.</param>
/// <param name="Environment">Production, staging or development.</param>
/// <param name="Distribution">OpenShift or Kubernetes; required (null is a validation error, DIST-4).</param>
/// <param name="WebConsoleUrl">Optional <c>https://</c> web console link; blank removes it.</param>
/// <param name="Description">Optional description; blank removes it.</param>
/// <param name="CaBundle">Optional PEM CA bundle; blank means system trust.</param>
/// <param name="SkipTlsVerify">Skip TLS verification (exclusive with a CA bundle).</param>
/// <param name="Version">The cluster's <c>version</c> the client last saw.</param>
public sealed record UpdateClusterCommand(
    string Name,
    string? DisplayName,
    string ApiUrl,
    ClusterEnvironment Environment,
    ClusterDistribution? Distribution,
    string? WebConsoleUrl,
    string? Description,
    string? CaBundle,
    bool SkipTlsVerify,
    uint Version) : ICommand, IAdminRequest, IMutatingCommand, IClusterSettings;
