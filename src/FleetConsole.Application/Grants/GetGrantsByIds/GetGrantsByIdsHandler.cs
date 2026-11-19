using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Credentials;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Common;
using Microsoft.Extensions.Options;

namespace FleetConsole.Application.Grants.GetGrantsByIds;

/// <summary>Answers <see cref="GetGrantsByIdsQuery"/> through <see cref="GrantProjection"/> (one statement, an <c>IN</c> list).</summary>
/// <param name="readModel">The read model.</param>
/// <param name="clock">The clock, for the credential expiry status.</param>
/// <param name="options">The credential settings.</param>
internal sealed class GetGrantsByIdsHandler(IReadModel readModel, IClock clock, IOptions<CredentialsOptions> options)
    : IRequestHandler<GetGrantsByIdsQuery, Result<IReadOnlyList<GrantDto>>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<GrantDto>>> Handle(GetGrantsByIdsQuery request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (request.GrantIds.Count == 0)
        {
            return Result.Success<IReadOnlyList<GrantDto>>([]);
        }

        var ids = request.GrantIds.Select(id => new GrantId(id)).ToList();
        var grants = await GrantProjection
            .LoadAsync(readModel, readModel.Grants.Where(g => ids.Contains(g.Id)), clock.UtcNow, options.Value, cancellationToken)
            .ConfigureAwait(false);

        // Back into request order; SQL returns the rows unordered.
        var byId = grants.ToDictionary(g => g.Id);
        IReadOnlyList<GrantDto> ordered = [.. request.GrantIds.Where(byId.ContainsKey).Select(id => byId[id])];
        return Result.Success(ordered);
    }
}
