using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Clusters;

/// <summary>
/// Errors of the cluster administration use cases that are not Domain rules: the version check every edit and
/// transition performs before changing the aggregate (ADR-0013 §4). Domain errors stay in <c>ClusterErrors</c>.
/// </summary>
public static class ClusterAdminErrors
{
    /// <summary>
    /// The request's <c>version</c> is not the cluster's current one: someone changed it since the client loaded it.
    /// Same code as the commit-time race (<c>PersistenceErrors.ConcurrencyConflict</c>), with the cluster noun
    /// (contract §2). HTTP 409.
    /// </summary>
    public static Error StaleVersion { get; } =
        Error.Conflict("Concurrency.Conflict", "This cluster was changed by someone else. Reload and try again.");
}
