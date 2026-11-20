using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Credentials.Tokens;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Credentials.RotateCredentialToken;

/// <summary>
/// Handles <see cref="RotateCredentialTokenCommand"/>: checks the client's version, then hands the new encrypted token,
/// fingerprint and metadata to <c>Credential.Rotate</c>. <c>UnitOfWorkBehavior</c> commits it with its audit entry.
/// </summary>
/// <remarks>
/// The version check gives the credential-specific 409; a change between this load and the commit is caught by the
/// <c>xmin</c> check at save time (generic <c>Concurrency.Conflict</c>).
/// </remarks>
/// <param name="clusters">Cluster repository.</param>
/// <param name="credentials">Credential repository.</param>
/// <param name="tokenProtector">Encrypts the token (ADR-0004).</param>
/// <param name="currentUser">The acting admin.</param>
/// <param name="clock">The clock.</param>
internal sealed class RotateCredentialTokenHandler(
    IClusterRepository clusters,
    ICredentialRepository credentials,
    ITokenProtector tokenProtector,
    ICurrentUser currentUser,
    IClock clock) : IRequestHandler<RotateCredentialTokenCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result> Handle(RotateCredentialTokenCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var found = await CredentialLookup
            .FindCredentialAsync(clusters, credentials, request.ClusterName, request.CredentialId, cancellationToken)
            .ConfigureAwait(false);
        if (found.IsFailure)
        {
            return found.Error;
        }

        var (cluster, credential) = found.Value;
        if (credential.Version != request.Version)
        {
            return CredentialLookup.ConcurrencyConflict;
        }

        credential.Rotate(
            tokenProtector.Protect(request.Token),
            TokenFingerprints.Compute(request.Token),
            TokenInspector.Inspect(request.Token),
            cluster.Name.Value,
            CredentialLookup.Actor(currentUser),
            clock.UtcNow);
        return Result.Success();
    }
}
