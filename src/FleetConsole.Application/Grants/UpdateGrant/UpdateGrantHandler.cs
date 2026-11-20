using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Grants.UpdateGrant;

/// <summary>
/// Handles <see cref="UpdateGrantCommand"/>: loads the grant, checks its version, resolves the requested credential and
/// lets <see cref="Grant.Change"/> apply the change (and refuse a credential of another cluster).
/// </summary>
/// <param name="grants">Grant repository.</param>
/// <param name="users">User repository (audit labels).</param>
/// <param name="clusters">Cluster repository (audit labels).</param>
/// <param name="credentials">Credential repository.</param>
/// <param name="currentUser">The acting admin.</param>
/// <param name="clock">The clock.</param>
internal sealed class UpdateGrantHandler(
    IGrantRepository grants,
    IUserRepository users,
    IClusterRepository clusters,
    ICredentialRepository credentials,
    ICurrentUser currentUser,
    IClock clock) : IRequestHandler<UpdateGrantCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result> Handle(UpdateGrantCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var grant = await grants.GetByIdAsync(new GrantId(request.GrantId), cancellationToken).ConfigureAwait(false);
        if (grant is null)
        {
            return GrantErrors.NotFound();
        }

        if (grant.Version != request.Version)
        {
            return GrantLookup.ConcurrencyConflict;
        }

        var credential = await credentials.GetByIdAsync(new CredentialId(request.CredentialId), cancellationToken)
            .ConfigureAwait(false);
        if (credential is null)
        {
            return CredentialFieldError(GrantLookup.CredentialDoesNotExistMessage);
        }

        // Labels carry the name of the credential the grant uses *before* the change (old → new in the audit entry).
        var labels = await GrantLookup.LabelsAsync(grant, users, clusters, credentials, cancellationToken).ConfigureAwait(false);
        var changed = grant.Change(request.AccessMode, credential, labels, GrantLookup.Actor(currentUser), clock.UtcNow);
        return changed.IsFailure ? CredentialFieldError(changed.Error.Message) : Result.Success();
    }

    private static ValidationError CredentialFieldError(string message) =>
        GrantLookup.FieldErrors(new() { [nameof(UpdateGrantCommand.CredentialId)] = [message] });
}
