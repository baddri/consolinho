using FleetConsole.Application.Access;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;

namespace FleetConsole.Application.Clusters.ListAccessibleClusters;

// Returned by GET /api/clusters (contract §6). Published in the OpenAPI document as the "AccessibleCluster" schema; the
// XML docs below are written for API consumers. Deliberately without API URL, CA or credential data (SW-1); the only
// credential-derived field is the inspect-namespace names of the effective grant's credential (NSA-3).

/// <summary>A cluster the signed-in user may switch to, as the cluster switcher shows it.</summary>
/// <param name="Name">The cluster name (the key in console URLs).</param>
/// <param name="DisplayName">The display name.</param>
/// <param name="Environment">The environment.</param>
/// <param name="Distribution">The declared distribution (OpenShift or Kubernetes): drives the OCP/K8s tag and theme only.</param>
/// <param name="AccessMode">The effective access mode: readOnly if the grant is read-only or the user is globally read-only.</param>
/// <param name="WebConsoleUrl">The cluster's own web console, if configured.</param>
/// <param name="FallbackNamespaces">Inspect namespaces of the credential behind the caller's effective grant, in saved
/// order; empty if none. Used by the namespace selector only when listing namespaces is forbidden.</param>
public sealed record AccessibleClusterDto(
    string Name,
    string DisplayName,
    ClusterEnvironment Environment,
    ClusterDistribution Distribution,
    AccessMode AccessMode,
    string? WebConsoleUrl,
    IReadOnlyList<string> FallbackNamespaces)
{
    /// <summary>
    /// Projects a resolved access to what the user sees: the one mapping shared by the cluster switcher and the fleet
    /// status lines (T-0321), so both always agree on identity and effective access mode.
    /// </summary>
    /// <param name="access">The user's resolved access to the cluster (from the current resolution, never a cache).</param>
    /// <returns>The DTO, with the resolver's effective mode.</returns>
    internal static AccessibleClusterDto From(ResolvedClusterAccess access)
    {
        ArgumentNullException.ThrowIfNull(access);
        return new AccessibleClusterDto(
            access.ClusterName.Value,
            access.ClusterDisplayName,
            access.Environment,
            access.Distribution,
            access.Resolution.EffectiveMode,
            access.WebConsoleUrl,
            access.WinnerInspectNamespaces);
    }
}
