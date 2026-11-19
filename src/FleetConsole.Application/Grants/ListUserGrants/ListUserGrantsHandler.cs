using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Credentials;
using FleetConsole.Domain.Common;
using Microsoft.Extensions.Options;

namespace FleetConsole.Application.Grants.ListUserGrants;

/// <summary>Answers <see cref="ListUserGrantsQuery"/> through <see cref="GrantProjection"/> (one statement for the rows).</summary>
/// <param name="readModel">The read model.</param>
/// <param name="clock">The clock, for the credential expiry status.</param>
/// <param name="options">The credential settings.</param>
internal sealed class ListUserGrantsHandler(IReadModel readModel, IClock clock, IOptions<CredentialsOptions> options)
    : IRequestHandler<ListUserGrantsQuery, Result<IReadOnlyList<GrantDto>>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<GrantDto>>> Handle(ListUserGrantsQuery request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var user = await GrantProjection.FindUserIdAsync(readModel, request.Username, cancellationToken).ConfigureAwait(false);
        if (user.IsFailure)
        {
            return user.Error;
        }

        var userId = user.Value;
        var grants = await GrantProjection
            .LoadAsync(readModel, readModel.Grants.Where(g => g.UserId == userId), clock.UtcNow, options.Value, cancellationToken)
            .ConfigureAwait(false);

        // Ordinal in memory: names are case-sensitive keys and the order must not depend on the database collation.
        IReadOnlyList<GrantDto> sorted = [.. grants.OrderBy(g => g.ClusterName, StringComparer.Ordinal)];
        return Result.Success(sorted);
    }
}
