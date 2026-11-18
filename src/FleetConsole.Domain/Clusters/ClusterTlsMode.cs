namespace FleetConsole.Domain.Clusters;

/// <summary>
/// How FleetConsole verifies a cluster API server's TLS certificate. Derived from <see cref="ApiServerEndpoint"/> (never
/// stored on its own) and shown in the cluster list and audit entries (CLU-3, CLU-7).
/// </summary>
public enum ClusterTlsMode
{
    /// <summary>The certificate must chain to the cluster's own <see cref="Clusters.CaBundle"/>.</summary>
    CaBundle = 0,

    /// <summary>The certificate must chain to the operating system's trust store (no CA bundle configured).</summary>
    SystemTrust = 1,

    /// <summary>Verification is disabled ("TLS not verified" warning, CLU-3).</summary>
    SkipVerify = 2,
}
