using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Proxy;

/// <summary>
/// One rule a proxied request must pass after the user's access to the cluster is established (ADR-0019 §7). Policies
/// run in registration order (<see cref="ProxyPolicyServiceCollectionExtensions.AddProxyPolicy{TPolicy}"/>) and the
/// first failure is returned, so blocking a new class of operations is a new policy, not a change to the handler or
/// the endpoint.
/// </summary>
public interface IProxyPolicy
{
    /// <summary>Decides whether the request may be forwarded.</summary>
    /// <param name="context">The request and the access facts about the user and cluster.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Success to continue with the next policy; otherwise the error returned to the client.</returns>
    ValueTask<Result> EvaluateAsync(ProxyRequestContext context, CancellationToken ct);
}
