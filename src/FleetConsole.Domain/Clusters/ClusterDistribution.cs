namespace FleetConsole.Domain.Clusters;

/// <summary>
/// The admin-declared Kubernetes distribution of a cluster (CP3.7 DIST-1). Presentation only (ADR-0032): it drives the
/// <c>OCP</c>/<c>K8s</c> tag and the theme in the SPA, while feature availability is still decided by the cluster's own
/// API discovery. Serialized as camelCase JSON strings and stored by name.
/// </summary>
public enum ClusterDistribution
{
    /// <summary>An OpenShift cluster (the default for clusters registered before CP3.7).</summary>
    OpenShift = 0,

    /// <summary>A plain (non-OpenShift) Kubernetes cluster.</summary>
    Kubernetes = 1,
}
