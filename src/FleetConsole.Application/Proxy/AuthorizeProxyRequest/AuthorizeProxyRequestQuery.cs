using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Proxy.Requests;

namespace FleetConsole.Application.Proxy.AuthorizeProxyRequest;

/// <summary>
/// "May the signed-in user send this request to this cluster, and with which endpoint and token?" (PRX-2/3, MUT-2/3/5;
/// ADR-0019 §5). Asked by the Api's proxy endpoint for every request — there is no access cache (Q11), so a revoked
/// grant takes effect on the next request. A query, not a command: it changes nothing (auditing is a separate step).
/// </summary>
/// <param name="ClusterName">The cluster name from the URL, not yet validated.</param>
/// <param name="Request">The validated and classified request.</param>
public sealed record AuthorizeProxyRequestQuery(string ClusterName, ProxyRequest Request)
    : IQuery<ProxyTarget>, IRequireAuthenticated;
