using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using Microsoft.Extensions.Options;

namespace FleetConsole.Application.Credentials.ListCredentials;

/// <summary>
/// Answers <see cref="ListCredentialsQuery"/> through <see cref="CredentialProjection"/> and applies the list's order.
/// </summary>
/// <remarks>
/// Sorting happens in memory (lists are bounded, ADR-0013 §7) with ordinal comparison, which matches the lowercase
/// DNS-label names and keeps the order independent of the database collation. Fleet order (CRED-7): <c>expiresAt</c>
/// ascending with <see langword="null"/> (no expiry, opaque) last, then cluster name, then credential name.
/// </remarks>
/// <param name="readModel">The read model.</param>
/// <param name="clock">The clock, for the expiry status.</param>
/// <param name="options">The credential settings.</param>
internal sealed class ListCredentialsHandler(IReadModel readModel, IClock clock, IOptions<CredentialsOptions> options)
    : IRequestHandler<ListCredentialsQuery, Result<IReadOnlyList<CredentialDto>>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<CredentialDto>>> Handle(ListCredentialsQuery request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        ClusterId? clusterId = null;
        if (request.ClusterName is not null)
        {
            var cluster = await CredentialProjection.FindClusterIdAsync(readModel, request.ClusterName, cancellationToken)
                .ConfigureAwait(false);
            if (cluster.IsFailure)
            {
                return cluster.Error;
            }

            clusterId = cluster.Value;
        }

        var credentials = await CredentialProjection
            .LoadAsync(readModel, clusterId, credentialId: null, clock.UtcNow, options.Value, cancellationToken)
            .ConfigureAwait(false);

        IReadOnlyList<CredentialDto> sorted = request.ClusterName is null
            ? [.. credentials
                .OrderBy(c => c.ExpiresAt is null)
                .ThenBy(c => c.ExpiresAt)
                .ThenBy(c => c.ClusterName, StringComparer.Ordinal)
                .ThenBy(c => c.Name, StringComparer.Ordinal)]
            : [.. credentials.OrderBy(c => c.Name, StringComparer.Ordinal)];
        return Result.Success(sorted);
    }
}
