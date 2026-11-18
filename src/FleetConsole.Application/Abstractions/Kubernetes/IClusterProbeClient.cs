namespace FleetConsole.Application.Abstractions.Kubernetes;

/// <summary>
/// Port for talking to a managed cluster's API server with a given token and TLS settings, used by the connection test
/// (ADR-0011, T-0020). Low-level on purpose: one method per Kubernetes call, categorized failures, no step logic.
/// </summary>
/// <remarks>
/// Implemented in Infrastructure (<c>ClusterProbeClient</c>) with a short-lived HTTP handler per session — never the CP2
/// forwarding pool, whose handlers are long-lived and keyed by cluster, not by (cluster, token) test run.
/// Application tests substitute a fake.
/// </remarks>
public interface IClusterProbeClient
{
    /// <summary>
    /// Opens a probe session (one TLS handler, so one TLS trust configuration) for a single test run. Dispose it at the
    /// end of the run; the token is held only for the session's lifetime.
    /// </summary>
    /// <param name="connection">API URL and TLS settings of the cluster.</param>
    /// <param name="token">The bearer token to send on every request.</param>
    /// <returns>A session whose calls all use <paramref name="connection"/> and <paramref name="token"/>.</returns>
    IClusterProbeSession Open(ClusterConnection connection, SensitiveString token);
}
