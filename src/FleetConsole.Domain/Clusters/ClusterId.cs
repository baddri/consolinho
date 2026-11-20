namespace FleetConsole.Domain.Clusters;

/// <summary>
/// Strongly typed identity of a <see cref="Cluster"/>. Credentials and grants reference their cluster through it. The
/// <see cref="ClusterName"/> is the natural key admins see in URLs; this id is the stable key used in references.
/// </summary>
/// <param name="Value">The underlying GUID (version 7, so ids sort roughly by creation time and index well).</param>
public readonly record struct ClusterId(Guid Value)
{
    /// <summary>Creates a new, time-ordered (version 7) identity for a cluster that is being registered.</summary>
    /// <returns>A fresh <see cref="ClusterId"/>.</returns>
    public static ClusterId New() => new(Guid.CreateVersion7());
}
