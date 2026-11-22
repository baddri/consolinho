using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Clusters;

namespace FleetConsole.Application.Clusters.RegisterCluster;

/// <summary>
/// Registers a cluster (CLU-1/2/3, contract §8.2 <c>POST /api/admin/clusters</c>). Returns the cluster name; the
/// endpoint then dispatches <c>GetClusterQuery</c> for the 201 body (ADR-0013 §5). Audited as
/// <c>cluster.registered</c> through the aggregate's event.
/// </summary>
/// <param name="Name">The cluster name (DNS label, ≤ 40 characters, unique, immutable).</param>
/// <param name="DisplayName">Optional display name; blank defaults to <paramref name="Name"/>.</param>
/// <param name="ApiUrl">The API server URL.</param>
/// <param name="Environment">Production, staging or development.</param>
/// <param name="Distribution">OpenShift or Kubernetes; required (null is a validation error, DIST-4).</param>
/// <param name="WebConsoleUrl">Optional <c>https://</c> link to the cluster's web console.</param>
/// <param name="Description">Optional description.</param>
/// <param name="CaBundle">Optional PEM CA bundle; blank means system trust.</param>
/// <param name="SkipTlsVerify">Skip TLS verification (exclusive with a CA bundle).</param>
/// <param name="IsEnabled">Whether granted users see the cluster right away.</param>
public sealed record RegisterClusterCommand(
    string Name,
    string? DisplayName,
    string ApiUrl,
    ClusterEnvironment Environment,
    ClusterDistribution? Distribution,
    string? WebConsoleUrl,
    string? Description,
    string? CaBundle,
    bool SkipTlsVerify,
    bool IsEnabled) : ICommand<string>, IAdminRequest, IMutatingCommand, IClusterSettings;
