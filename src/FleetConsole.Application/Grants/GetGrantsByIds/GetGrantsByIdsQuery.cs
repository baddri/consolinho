using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Grants.GetGrantsByIds;

/// <summary>
/// Reads several grants in the order of <paramref name="GrantIds"/>. Not an endpoint of its own: the bulk grant endpoint
/// dispatches it after <c>BulkGrantCommand</c> committed, so the response lists the created grants in request order
/// with their post-commit <c>version</c> (ADR-0013 §5). Ids that match no grant are skipped.
/// </summary>
/// <param name="GrantIds">The grants to read.</param>
public sealed record GetGrantsByIdsQuery(IReadOnlyList<Guid> GrantIds) : IQuery<IReadOnlyList<GrantDto>>, IAdminRequest;
