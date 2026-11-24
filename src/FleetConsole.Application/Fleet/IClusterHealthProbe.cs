using FleetConsole.Application.Access;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Fleet;

/// <summary>
/// Produces one cluster's fleet health facts for one user (ADR-0041 §3, §5): proxy policies first, then the
/// per-(cluster, credential) cache, then — on a miss — the upstream probes under <c>Fleet:ClusterTimeout</c>.
/// </summary>
/// <remarks>
/// Stateless and safe for concurrent calls: the fleet stream (T-0321) calls it in parallel for many clusters within one
/// request scope. It is a service, not a dispatched query, because N concurrent dispatches would share the scope's
/// behaviors and current user across threads (ADR-0041 §3).
/// </remarks>
internal interface IClusterHealthProbe
{
    /// <summary>
    /// Returns the cluster's facts, from the cache or freshly probed with the winning grant's credential.
    /// </summary>
    /// <param name="access">The user's resolved access to the cluster (winner, connection, encrypted token).</param>
    /// <param name="userId">The signed-in user (for the policy context).</param>
    /// <param name="sessionIsReadOnly">The session's read-only flag; combined with the stored flag as the proxy does.</param>
    /// <param name="cancellationToken">The request's token; cancelling it throws <see cref="OperationCanceledException"/>.</param>
    /// <returns>The facts; expected problems (refused, unreachable, timeout, …) are a <c>Failure</c> in them.</returns>
    Task<ClusterHealthFacts> ProbeAsync(
        ResolvedClusterAccess access,
        UserId userId,
        bool sessionIsReadOnly,
        CancellationToken cancellationToken);
}
