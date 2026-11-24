using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Users.GetEffectiveAccess;

/// <summary>
/// Explains what a user can reach and why (EFF-1..5, <c>GET /api/admin/users/{username}/effective-access</c>): per
/// cluster, the winning grant, the effective mode and every matching grant's verdict — answering "why does Sam have (or
/// not have) write access on prod-eu-1?".
/// </summary>
/// <remarks>
/// Computed by the same reader and resolver as the proxy and the switcher (<c>ClusterAccessReader</c>, PREC-8,
/// ADR-0034 §6), so the view can't disagree with what the user experiences. Fails with <c>Users.NotFound</c>.
/// </remarks>
/// <param name="Username">The username from the route (exact, case-sensitive).</param>
public sealed record GetEffectiveAccessQuery(string Username) : IQuery<EffectiveAccessDto>, IAdminRequest;
