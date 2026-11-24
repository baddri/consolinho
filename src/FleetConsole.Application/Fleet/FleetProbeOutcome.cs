namespace FleetConsole.Application.Fleet;

/// <summary>
/// How one probe of a reachable cluster went (contract §2). The section's counts are null unless <see cref="Ok"/>.
/// </summary>
public enum FleetProbeOutcome
{
    /// <summary>Read successfully; the section's counts are filled.</summary>
    Ok,

    /// <summary>403 for this resource: the grant's token may not read it ("Restricted" cell).</summary>
    Forbidden,

    /// <summary>404 for this resource (e.g. no ClusterVersion on a cluster declared OpenShift); shown as "—".</summary>
    NotFound,
}
