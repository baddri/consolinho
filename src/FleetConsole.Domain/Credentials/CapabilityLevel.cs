namespace FleetConsole.Domain.Credentials;

/// <summary>Headline of a connection test's capability summary (TEST-3), from most to least powerful.</summary>
public enum CapabilityLevel
{
    /// <summary>Every verb on every resource (<c>*</c> on <c>*</c>).</summary>
    ClusterAdmin = 0,

    /// <summary>Can modify workloads in all namespaces.</summary>
    ClusterWideEdit = 1,

    /// <summary>Can read workloads in all namespaces.</summary>
    ClusterWideView = 2,

    /// <summary>Cannot even list pods cluster-wide.</summary>
    Limited = 3,
}
