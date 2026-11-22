using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;

namespace FleetConsole.Application.Clusters.ListAccessibleClusters;

// Returned by GET /api/clusters (contract §6). Published in the OpenAPI document as the "AccessibleCluster" schema; the
// XML docs below are written for API consumers. Deliberately without API URL, CA or credential data (SW-1).

/// <summary>A cluster the signed-in user may switch to, as the cluster switcher shows it.</summary>
/// <param name="Name">The cluster name (the key in console URLs).</param>
/// <param name="DisplayName">The display name.</param>
/// <param name="Environment">The environment.</param>
/// <param name="Distribution">The declared distribution (OpenShift or Kubernetes): drives the OCP/K8s tag and theme only.</param>
/// <param name="AccessMode">The effective access mode: readOnly if the grant is read-only or the user is globally read-only.</param>
/// <param name="WebConsoleUrl">The cluster's own web console, if configured.</param>
public sealed record AccessibleClusterDto(
    string Name,
    string DisplayName,
    ClusterEnvironment Environment,
    ClusterDistribution Distribution,
    AccessMode AccessMode,
    string? WebConsoleUrl);
