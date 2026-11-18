namespace FleetConsole.Domain.Clusters;

/// <summary>
/// The fixed environment classification of a cluster (Q5). Drives the coloured environment label in the switcher and
/// admin pages and the production warnings (CLU-3, GRANT-2). Serialized as camelCase JSON strings.
/// </summary>
/// <remarks>The declaration order is the sort order of the cluster switcher (production first); do not reorder.</remarks>
public enum ClusterEnvironment
{
    /// <summary>Production: red label; extra confirmations for risky settings and ReadWrite grants.</summary>
    Production = 0,

    /// <summary>Staging: orange label.</summary>
    Staging = 1,

    /// <summary>Development: green label.</summary>
    Development = 2,
}
