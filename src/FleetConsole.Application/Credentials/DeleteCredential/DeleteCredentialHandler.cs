using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Credentials.DeleteCredential;

/// <summary>
/// Handles <see cref="DeleteCredentialCommand"/>: counts the grants using the credential, lets the aggregate decide
/// (<c>Credential.MarkForDeletion</c>, which raises the audit event), then stages the delete.
/// </summary>
/// <remarks>
/// A grant created between the count and the commit makes the database refuse the delete (foreign key, checked at
/// statement end); <c>UnitOfWorkBehavior</c> answers that race with 409 <c>Concurrency.Conflict</c>.
/// </remarks>
/// <param name="clusters">Cluster repository.</param>
/// <param name="credentials">Credential repository.</param>
/// <param name="grants">Grant repository, for the usage count.</param>
internal sealed class DeleteCredentialHandler(
    IClusterRepository clusters,
    ICredentialRepository credentials,
    IGrantRepository grants) : IRequestHandler<DeleteCredentialCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result> Handle(DeleteCredentialCommand request, CancellationToken cancellationToken)
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
        var grantCount = await grants.CountByCredentialAsync(credential.Id, cancellationToken).ConfigureAwait(false);
        var deletion = credential.MarkForDeletion(grantCount, cluster.Name.Value);
        if (deletion.IsFailure)
        {
            return deletion;
        }

        credentials.Remove(credential);
        return Result.Success();
    }
}
