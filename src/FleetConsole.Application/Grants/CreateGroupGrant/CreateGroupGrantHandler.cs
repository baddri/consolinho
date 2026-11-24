using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Grants.CreateGroupGrant;

/// <summary>
/// Handles <see cref="CreateGroupGrantCommand"/>: resolves cluster and credential, reads the cluster's group grants as
/// <see cref="GroupGrantSlot"/>s (one query), then lets <see cref="Grant.CreateForGroup"/> enforce "credential of this
/// cluster", "one grant per group and cluster" and "one priority per cluster". <c>UnitOfWorkBehavior</c> commits the
/// grant with its audit entry.
/// </summary>
/// <remarks>
/// Unknown references are reported together, like <c>CreateGrantHandler</c>. A concurrent create for the same group or
/// priority passes the pre-check and fails at commit on a partial unique index (409 <c>Persistence.DuplicateKey</c>).
/// </remarks>
/// <param name="clusters">Cluster repository.</param>
/// <param name="credentials">Credential repository.</param>
/// <param name="grants">Grant repository.</param>
/// <param name="currentUser">The acting admin.</param>
/// <param name="clock">The clock.</param>
internal sealed class CreateGroupGrantHandler(
    IClusterRepository clusters,
    ICredentialRepository credentials,
    IGrantRepository grants,
    ICurrentUser currentUser,
    IClock clock) : IRequestHandler<CreateGroupGrantCommand, Result<Guid>>
{
    /// <inheritdoc />
    public async Task<Result<Guid>> Handle(CreateGroupGrantCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // The validator already refused invalid names; this only turns the string into the value object.
        var group = GroupName.Create(request.GroupName);
        if (group.IsFailure)
        {
            return GrantLookup.FieldErrors(new() { [nameof(CreateGroupGrantCommand.GroupName)] = [group.Error.Message] });
        }

        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);

        var clusterName = ClusterName.Create(request.ClusterName);
        var cluster = clusterName.IsSuccess
            ? await clusters.GetByNameAsync(clusterName.Value, cancellationToken).ConfigureAwait(false)
            : null;
        if (cluster is null)
        {
            errors.AddMessage(nameof(CreateGroupGrantCommand.ClusterName), GrantLookup.ClusterDoesNotExist(request.ClusterName));
        }

        var credential = await credentials.GetByIdAsync(new CredentialId(request.CredentialId), cancellationToken)
            .ConfigureAwait(false);
        if (credential is null)
        {
            errors.AddMessage(nameof(CreateGroupGrantCommand.CredentialId), GrantLookup.CredentialDoesNotExistMessage);
        }

        if (cluster is null || credential is null)
        {
            return GrantLookup.FieldErrors(errors);
        }

        var slots = await grants.GetGroupGrantSlotsAsync([cluster.Id], cancellationToken).ConfigureAwait(false);
        var grant = Grant.CreateForGroup(
            group.Value,
            cluster,
            credential,
            request.AccessMode,
            request.Priority,
            [.. slots[cluster.Id]],
            GrantLookup.Actor(currentUser),
            clock.UtcNow);
        if (grant.IsFailure)
        {
            // Invalid input → field errors; AlreadyExists and PriorityTaken stay the 409s.
            return GrantLookup.GroupGrantFieldError(grant.Error) is { } fieldError ? fieldError : grant.Error;
        }

        grants.Add(grant.Value);
        return grant.Value.Id.Value;
    }
}
