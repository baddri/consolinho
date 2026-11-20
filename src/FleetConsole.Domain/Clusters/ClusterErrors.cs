using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Clusters;

/// <summary>
/// The expected failures of the cluster area, with the stable codes and user-facing messages of the API contract (§2).
/// Returned by <see cref="Cluster"/> behaviour methods, <see cref="ClusterName.Create"/> and the cluster use-case
/// handlers; the Api maps the <see cref="ErrorType"/> to the HTTP status and shows <see cref="Error.Message"/> verbatim.
/// </summary>
public static class ClusterErrors
{
    /// <summary>No cluster with the given name exists (unknown <c>{name}</c> in a route). HTTP 404.</summary>
    /// <param name="name">The cluster name that was looked up.</param>
    /// <returns>A <c>Clusters.NotFound</c> error.</returns>
    public static Error NotFound(string name) =>
        Error.NotFound("Clusters.NotFound", $"Cluster {name} was not found.");

    /// <summary>Registering a cluster whose name already exists (CLU-1). HTTP 409.</summary>
    /// <param name="name">The duplicate name.</param>
    /// <returns>A <c>Clusters.NameTaken</c> error.</returns>
    public static Error NameTaken(string name) =>
        Error.Conflict("Clusters.NameTaken", $"Cluster {name} already exists.");

    /// <summary>Deleting a cluster that is still enabled (CLU-6). HTTP 409.</summary>
    /// <param name="name">The cluster's name.</param>
    /// <returns>A <c>Clusters.NotDisabled</c> error.</returns>
    public static Error NotDisabled(string name) =>
        Error.Conflict("Clusters.NotDisabled", $"Disable {name} before deleting it.");

    /// <summary>
    /// A cluster name breaks the DNS-label rules (CLU-1). Produced by <see cref="ClusterName.Create"/>; validators
    /// surface the message as a field error on <c>name</c>. HTTP 400.
    /// </summary>
    /// <param name="message">Which rule was broken.</param>
    /// <returns>A <c>Clusters.InvalidName</c> error.</returns>
    public static Error InvalidName(string message) =>
        Error.Validation("Clusters.InvalidName", message);
}
