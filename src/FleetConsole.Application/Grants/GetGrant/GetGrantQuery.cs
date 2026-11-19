using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Grants.GetGrant;

/// <summary>
/// Reads one grant. Not an endpoint of its own: the create and update endpoints dispatch it after their command
/// committed, so the response carries the post-commit <c>version</c> (ADR-0013 §5).
/// </summary>
/// <param name="GrantId">The grant; unknown → <c>Grants.NotFound</c>.</param>
public sealed record GetGrantQuery(Guid GrantId) : IQuery<GrantDto>, IAdminRequest;
