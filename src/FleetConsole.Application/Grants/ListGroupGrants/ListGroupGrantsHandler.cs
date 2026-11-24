using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Credentials;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Common;
using Microsoft.Extensions.Options;

namespace FleetConsole.Application.Grants.ListGroupGrants;

/// <summary>Answers <see cref="ListGroupGrantsQuery"/> through <see cref="GrantProjection"/> (one statement for the rows).</summary>
/// <param name="readModel">The read model.</param>
/// <param name="clock">The clock, for the credential expiry status.</param>
/// <param name="options">The credential settings.</param>
internal sealed class ListGroupGrantsHandler(IReadModel readModel, IClock clock, IOptions<CredentialsOptions> options)
    : IRequestHandler<ListGroupGrantsQuery, Result<IReadOnlyList<GrantDto>>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<GrantDto>>> Handle(ListGroupGrantsQuery request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // An invalid name can't have grants: answer without a query.
        var group = GroupName.Create(request.GroupName);
        if (group.IsFailure)
        {
            return Result.Success<IReadOnlyList<GrantDto>>([]);
        }

        var name = group.Value;
        var grants = await GrantProjection
            .LoadAsync(readModel, readModel.Grants.Where(g => g.GroupName == name), clock.UtcNow, options.Value, cancellationToken)
            .ConfigureAwait(false);

        // Ordinal in memory: cluster names are case-sensitive keys and the order must not depend on the database collation.
        IReadOnlyList<GrantDto> sorted = [.. grants.OrderBy(g => g.ClusterName, StringComparer.Ordinal)];
        return Result.Success(sorted);
    }
}
