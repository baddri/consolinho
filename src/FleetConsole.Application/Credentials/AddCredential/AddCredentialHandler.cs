using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Credentials.Tokens;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Credentials.AddCredential;

/// <summary>
/// Handles <see cref="AddCredentialCommand"/>: derives fingerprint and metadata from the plaintext, encrypts it, and adds
/// the <see cref="Credential"/> aggregate. <c>UnitOfWorkBehavior</c> commits it with its audit entry.
/// </summary>
/// <remarks>
/// This is the only moment the plaintext exists on the add path: it is fingerprinted, inspected and encrypted, then
/// dropped. Nothing derived from it besides the fingerprint and the JWT claims is kept. A concurrent add of the same
/// name passes the pre-check and fails at commit on the unique index (409 <c>Persistence.DuplicateKey</c>).
/// </remarks>
/// <param name="clusters">Cluster repository.</param>
/// <param name="credentials">Credential repository.</param>
/// <param name="tokenProtector">Encrypts the token (ADR-0004).</param>
/// <param name="currentUser">The acting admin.</param>
/// <param name="clock">The clock.</param>
internal sealed class AddCredentialHandler(
    IClusterRepository clusters,
    ICredentialRepository credentials,
    ITokenProtector tokenProtector,
    ICurrentUser currentUser,
    IClock clock) : IRequestHandler<AddCredentialCommand, Result<Guid>>
{
    /// <inheritdoc />
    public async Task<Result<Guid>> Handle(AddCredentialCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var cluster = await CredentialLookup.FindClusterAsync(clusters, request.ClusterName, cancellationToken).ConfigureAwait(false);
        if (cluster.IsFailure)
        {
            return cluster.Error;
        }

        // The validator has checked the name; a failure here would mean the pipeline was bypassed.
        var name = CredentialName.Create(request.Name);
        if (name.IsFailure)
        {
            return name.Error;
        }

        if (await credentials.NameExistsAsync(cluster.Value.Id, name.Value, cancellationToken).ConfigureAwait(false))
        {
            return CredentialErrors.NameTaken(name.Value.Value, cluster.Value.Name.Value);
        }

        var credential = Credential.Add(
            cluster.Value,
            name.Value,
            request.Description,
            tokenProtector.Protect(request.Token),
            TokenFingerprints.Compute(request.Token),
            TokenInspector.Inspect(request.Token),
            // Validated by AddCredentialValidator, so Value cannot throw unless the pipeline was bypassed.
            InspectNamespaces.Create(request.InspectNamespaces).Value,
            CredentialLookup.Actor(currentUser),
            clock.UtcNow);
        credentials.Add(credential);

        return credential.Id.Value;
    }
}
