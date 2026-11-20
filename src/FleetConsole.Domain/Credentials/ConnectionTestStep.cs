namespace FleetConsole.Domain.Credentials;

/// <summary>The steps of a connection test (TEST-2) in execution order; a stored summary names the one that failed.</summary>
public enum ConnectionTestStep
{
    /// <summary><c>GET /version</c>: DNS, TCP and TLS to the API server.</summary>
    Reachability = 0,

    /// <summary>Whether the cluster accepts the token (401 fails here).</summary>
    Authentication = 1,

    /// <summary>The username the cluster sees for the token.</summary>
    Identity = 2,

    /// <summary>The OpenShift <c>ClusterVersion</c> (forbidden is a warning, not a failure).</summary>
    OpenShiftVersion = 3,

    /// <summary>The capability summary from access reviews (TEST-3).</summary>
    Capabilities = 4,
}
