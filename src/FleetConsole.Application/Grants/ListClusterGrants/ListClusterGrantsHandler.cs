using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Credentials;
using FleetConsole.Domain.Common;
using Microsoft.Extensions.Options;

namespace FleetConsole.Application.Grants.ListClusterGrants;

/// <summary>Answers <see cref="ListClusterGrantsQuery"/> through <see cref="GrantProjection"/> (one statement for the rows).</summary>
/// <param name="readModel">The read model.</param>
/// <param name="clock">The clock, for the credential expiry status.</param>
/// <param name="options">The credential settings.</param>
internal sealed class ListClusterGrantsHandler(IReadModel readModel, IClock clock, IOptions<CredentialsOptions> options)
    : IRequestHandler<ListClusterGrantsQuery, Result<IReadOnlyList<GrantDto>>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<GrantDto>>> Handle(ListClusterGrantsQuery request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var cluster = await CredentialProjection.FindClusterIdAsync(readModel, request.ClusterName, cancellationToken)
            .ConfigureAwait(false);
        if (cluster.IsFailure)
        {
            return cluster.Error;
        }

        var clusterId = cluster.Value;
        var grants = await GrantProjection
            .LoadAsync(readModel, readModel.Grants.Where(g => g.ClusterId == clusterId), clock.UtcNow, options.Value, cancellationToken)
            .ConfigureAwait(false);

        // User grants first, then group grants (UIG-4), each by subject name. Ordinal in memory: usernames and group names
        // are case-sensitive keys and the order must not depend on the database collation.
        IReadOnlyList<GrantDto> sorted =
        [
            .. grants.OrderBy(g => g.SubjectKind).ThenBy(g => g.SubjectName, StringComparer.Ordinal),
        ];
        return Result.Success(sorted);
    }
}
