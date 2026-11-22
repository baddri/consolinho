namespace FleetConsole.Domain.Credentials;

/// <summary>The steps of a connection test (TEST-2) in execution order; a stored summary names the one that failed.</summary>
/// <remarks>
/// Members are <b>declared</b> in execution order; the numeric values are append-only and therefore not in order
/// (<see cref="Distribution"/> came later). Nothing depends on the numbers: the database and JSON use the names, and the
/// tester has its own step order.
/// </remarks>
public enum ConnectionTestStep
{
    /// <summary><c>GET /version</c>: DNS, TCP and TLS to the API server.</summary>
    Reachability = 0,

    /// <summary>Whether the cluster accepts the token (401 fails here).</summary>
    Authentication = 1,

    /// <summary>The username the cluster sees for the token.</summary>
    Identity = 2,

    /// <summary><c>GET /apis</c>: which distribution the cluster serves, compared with the declared one (ADR-0032). Never
    /// fails; a mismatch or unreadable discovery is a warning.</summary>
    Distribution = 5,

    /// <summary>The OpenShift <c>ClusterVersion</c> (forbidden is a warning, not a failure).</summary>
    OpenShiftVersion = 3,

    /// <summary>The capability summary from access reviews (TEST-3).</summary>
    Capabilities = 4,
}
