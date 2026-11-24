using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Grants.UpdateGrant;

/// <summary>
/// Handles <see cref="UpdateGrantCommand"/>: loads the grant, checks its version, resolves the requested credential and
/// lets <see cref="Grant.Change"/> (user grant) or <see cref="Grant.ChangeGroupGrant"/> (group grant, checked against
/// the cluster's group grant slots, one query) apply the change and refuse invalid input or a taken priority.
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

        // The priority's presence depends on the kind; checked before any further lookup.
        var isGroupGrant = grant.SubjectKind == GrantSubjectKind.Group;
        if (isGroupGrant && request.Priority is null)
        {
            return PriorityFieldError(GrantValidation.PriorityMessage);
        }

        if (!isGroupGrant && request.Priority is not null)
        {
            return PriorityFieldError(GrantValidation.PriorityOnUserGrantMessage);
        }

        var credential = await credentials.GetByIdAsync(new CredentialId(request.CredentialId), cancellationToken)
            .ConfigureAwait(false);
        if (credential is null)
        {
            return CredentialFieldError(GrantLookup.CredentialDoesNotExistMessage);
        }

        // Labels carry the name of the credential the grant uses *before* the change (old → new in the audit entry).
        var labels = await GrantLookup.LabelsAsync(grant, users, clusters, credentials, cancellationToken).ConfigureAwait(false);
        var actor = GrantLookup.Actor(currentUser);
        if (!isGroupGrant)
        {
            var changed = grant.Change(request.AccessMode, credential, labels, actor, clock.UtcNow);
            return changed.IsFailure ? CredentialFieldError(changed.Error.Message) : Result.Success();
        }

        // ChangeGroupGrant ignores the grant's own slot, so all of the cluster's slots can be passed.
        var slots = await grants.GetGroupGrantSlotsAsync([grant.ClusterId], cancellationToken).ConfigureAwait(false);
        var groupChanged = grant.ChangeGroupGrant(
            request.AccessMode, credential, request.Priority!.Value, [.. slots[grant.ClusterId]], labels, actor, clock.UtcNow);
        if (groupChanged.IsFailure)
        {
            // Invalid input becomes field errors; PriorityTaken stays the 409.
            return GrantLookup.GroupGrantFieldError(groupChanged.Error) is { } fieldError ? fieldError : groupChanged.Error;
        }

        return Result.Success();
    }

    private static ValidationError PriorityFieldError(string message) =>
        GrantLookup.FieldErrors(new() { [nameof(UpdateGrantCommand.Priority)] = [message] });

    private static ValidationError CredentialFieldError(string message) =>
        GrantLookup.FieldErrors(new() { [nameof(UpdateGrantCommand.CredentialId)] = [message] });
}
