using FleetConsole.Application.Proxy.Requests;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Proxy;

/// <summary>
/// Everything an <see cref="IProxyPolicy"/> may base its decision on: who sends the request, to which cluster, with
/// which grant, and what the request is. Built once per request by the authorization handler from the single access
/// query; policies never hit the database themselves.
/// </summary>
/// <param name="UserId">The signed-in user's id.</param>
/// <param name="Username">The signed-in user's name (as stored).</param>
/// <param name="ClusterName">The target cluster's name.</param>
/// <param name="Environment">The target cluster's environment (for environment-specific rules).</param>
/// <param name="GrantMode">The access mode of the user's grant on the cluster.</param>
/// <param name="UserIsReadOnly">
/// <see langword="true"/> when the user is globally read-only according to the stored user <em>or</em> the session,
/// whichever is stricter (ADR-0019 §5).
/// </param>
/// <param name="Request">The validated and classified request.</param>
public sealed record ProxyRequestContext(
    UserId UserId,
    string Username,
    string ClusterName,
    ClusterEnvironment Environment,
    AccessMode GrantMode,
    bool UserIsReadOnly,
    ProxyRequest Request);
