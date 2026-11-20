using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Grants.CreateGrant;

/// <summary>
/// Handles <see cref="CreateGrantCommand"/>: resolves the three body references, then lets <see cref="Grant.Create"/>
/// enforce "credential of this cluster" and "one grant per user and cluster". <c>UnitOfWorkBehavior</c> commits the
/// grant with its audit entry.
/// </summary>
/// <remarks>
/// All unknown references are reported together, so the form can mark every bad field at once. A concurrent create
/// for the same pair passes the pre-check and fails at commit on the unique index (409 <c>Persistence.DuplicateKey</c>).
/// </remarks>
/// <param name="users">User repository.</param>
/// <param name="clusters">Cluster repository.</param>
/// <param name="credentials">Credential repository.</param>
/// <param name="grants">Grant repository.</param>
/// <param name="currentUser">The acting admin.</param>
/// <param name="clock">The clock.</param>
internal sealed class CreateGrantHandler(
    IUserRepository users,
    IClusterRepository clusters,
    ICredentialRepository credentials,
    IGrantRepository grants,
    ICurrentUser currentUser,
    IClock clock) : IRequestHandler<CreateGrantCommand, Result<Guid>>
{
    /// <inheritdoc />
    public async Task<Result<Guid>> Handle(CreateGrantCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);

        // Values that aren't even valid names can't exist: same message as an unknown one.
        var username = Username.Create(request.Username);
        var user = username.IsSuccess
            ? await users.GetByUsernameAsync(username.Value, cancellationToken).ConfigureAwait(false)
            : null;
        if (user is null)
        {
            errors.AddMessage(nameof(CreateGrantCommand.Username), GrantLookup.UserDoesNotExist(request.Username));
        }

        var clusterName = ClusterName.Create(request.ClusterName);
        var cluster = clusterName.IsSuccess
            ? await clusters.GetByNameAsync(clusterName.Value, cancellationToken).ConfigureAwait(false)
            : null;
        if (cluster is null)
        {
            errors.AddMessage(nameof(CreateGrantCommand.ClusterName), GrantLookup.ClusterDoesNotExist(request.ClusterName));
        }

        var credential = await credentials.GetByIdAsync(new CredentialId(request.CredentialId), cancellationToken)
            .ConfigureAwait(false);
        if (credential is null)
        {
            errors.AddMessage(nameof(CreateGrantCommand.CredentialId), GrantLookup.CredentialDoesNotExistMessage);
        }

        if (user is null || cluster is null || credential is null)
        {
            return GrantLookup.FieldErrors(errors);
        }

        var existing = await grants.GetClusterIdsForUserAsync(user.Id, cancellationToken).ConfigureAwait(false);
        var grant = Grant.Create(
            user, cluster, credential, request.AccessMode, existing, GrantLookup.Actor(currentUser), clock.UtcNow);
        if (grant.IsFailure)
        {
            // CredentialNotInCluster is a body-reference problem → field error; AlreadyExists stays the 409.
            return grant.Error.Code == GrantErrors.CredentialNotInCluster().Code
                ? GrantLookup.FieldErrors(new() { [nameof(CreateGrantCommand.CredentialId)] = [grant.Error.Message] })
                : grant.Error;
        }

        grants.Add(grant.Value);
        return grant.Value.Id.Value;
    }
}
