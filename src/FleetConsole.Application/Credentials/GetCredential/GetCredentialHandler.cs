using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using Microsoft.Extensions.Options;

namespace FleetConsole.Application.Credentials.GetCredential;

/// <summary>Answers <see cref="GetCredentialQuery"/> through <see cref="CredentialProjection"/>.</summary>
/// <param name="readModel">The read model.</param>
/// <param name="clock">The clock, for the expiry status.</param>
/// <param name="options">The credential settings.</param>
internal sealed class GetCredentialHandler(IReadModel readModel, IClock clock, IOptions<CredentialsOptions> options)
    : IRequestHandler<GetCredentialQuery, Result<CredentialDto>>
{
    /// <inheritdoc />
    public async Task<Result<CredentialDto>> Handle(GetCredentialQuery request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var cluster = await CredentialProjection.FindClusterIdAsync(readModel, request.ClusterName, cancellationToken)
            .ConfigureAwait(false);
        if (cluster.IsFailure)
        {
            return cluster.Error;
        }

        // Filtering by both ids makes a credential of another cluster indistinguishable from an unknown one.
        var credentials = await CredentialProjection
            .LoadAsync(readModel, cluster.Value, new CredentialId(request.CredentialId), clock.UtcNow, options.Value, cancellationToken)
            .ConfigureAwait(false);
        return credentials is [var credential] ? credential : CredentialErrors.NotFound();
    }
}
