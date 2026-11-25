using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Fleet.GetFleetStatus;

/// <summary>
/// The fleet overview's health of every cluster the signed-in user may access (FBE-1/2/3/7, ADR-0041 §1):
/// <c>GET /api/fleet/status</c>, written as one NDJSON line per cluster in completion order.
/// </summary>
/// <remarks>
/// Deliberately not cacheable as a whole: the per-(cluster, credential) facts are cached inside
/// <see cref="IClusterHealthProbe"/>, while identity and access mode are always resolved fresh. The answer is a
/// <see cref="FleetStatusStream"/> that starts probing only when enumerated, so the endpoint decides when work begins.
/// </remarks>
public sealed record GetFleetStatusQuery : IQuery<FleetStatusStream>, IRequireAuthenticated;
