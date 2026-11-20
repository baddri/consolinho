using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Grants.BulkGrant;

/// <summary>
/// Handles <see cref="BulkGrantCommand"/>: validates every item against the database, collects <em>all</em> item
/// problems, and only if there are none stages one <see cref="Grant"/> per item.
/// </summary>
/// <remarks>
/// <para><b>Constant number of queries:</b> the user, the clusters (<c>GetByNamesAsync</c>), the credentials
/// (<c>GetByIdsAsync</c>) and the user's existing grant clusters are each read once, whatever the item count.</para>
/// <para><b>All or nothing:</b> grants are only added to the repository after every item passed, and
/// <c>UnitOfWorkBehavior</c> writes them with their audit entries (one <c>grant.created</c> each, ADR-0008) in a single
/// <c>SaveChanges</c>, which is one database transaction; a commit-time failure (a concurrent grant or delete) writes
/// nothing. Aggregates created for items before a failing one are never tracked, so their events are dropped.</para>
/// </remarks>
/// <param name="users">User repository.</param>
/// <param name="clusters">Cluster repository.</param>
/// <param name="credentials">Credential repository.</param>
/// <param name="grants">Grant repository.</param>
/// <param name="currentUser">The acting admin.</param>
/// <param name="clock">The clock.</param>
internal sealed class BulkGrantHandler(
    IUserRepository users,
    IClusterRepository clusters,
    ICredentialRepository credentials,
    IGrantRepository grants,
    ICurrentUser currentUser,
    IClock clock) : IRequestHandler<BulkGrantCommand, Result<IReadOnlyList<Guid>>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<Guid>>> Handle(BulkGrantCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // The user is the route value: unknown → 404 (ADR-0013 §8), unlike the items' body references.
        var username = Username.Create(request.Username);
        var user = username.IsSuccess
            ? await users.GetByUsernameAsync(username.Value, cancellationToken).ConfigureAwait(false)
            : null;
        if (user is null)
        {
            return UserErrors.NotFound(request.Username);
        }

        var clustersByName = await LoadClustersAsync(request.Items, cancellationToken).ConfigureAwait(false);
        var credentialIds = request.Items.Select(i => new CredentialId(i.CredentialId)).Distinct().ToList();
        var credentialsById = (await credentials.GetByIdsAsync(credentialIds, cancellationToken).ConfigureAwait(false))
            .ToDictionary(c => c.Id);

        // Grant.Create checks "one grant per user and cluster" against this set; it grows with every accepted item so the
        // rule also holds within the request (the validator already rejects duplicate names, this keeps the domain
        // contract honest).
        var granted = new HashSet<ClusterId>(
            await grants.GetClusterIdsForUserAsync(user.Id, cancellationToken).ConfigureAwait(false));

        var actor = GrantLookup.Actor(currentUser);
        var now = clock.UtcNow;
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        var created = new List<Grant>(request.Items.Count);
        for (var i = 0; i < request.Items.Count; i++)
        {
            var item = request.Items[i];
            var clusterField = $"{nameof(BulkGrantCommand.Items)}[{i}].{nameof(BulkGrantItem.ClusterName)}";
            var credentialField = $"{nameof(BulkGrantCommand.Items)}[{i}].{nameof(BulkGrantItem.CredentialId)}";

            clustersByName.TryGetValue(item.ClusterName, out var cluster);
            if (cluster is null)
            {
                errors.AddMessage(clusterField, GrantLookup.ClusterDoesNotExist(item.ClusterName));
            }

            credentialsById.TryGetValue(new CredentialId(item.CredentialId), out var credential);
            if (credential is null)
            {
                errors.AddMessage(credentialField, GrantLookup.CredentialDoesNotExistMessage);
            }

            if (cluster is null || credential is null)
            {
                continue;
            }

            var grant = Grant.Create(user, cluster, credential, request.AccessMode, granted, actor, now);
            if (grant.IsSuccess)
            {
                granted.Add(cluster.Id);
                created.Add(grant.Value);
            }
            else if (grant.Error.Code == GrantErrors.CredentialNotInCluster().Code)
            {
                errors.AddMessage(credentialField, grant.Error.Message);
            }
            else
            {
                // AlreadyExists: the bulk message is shorter than the 409's (contract §9.4).
                errors.AddMessage(clusterField, $"{user.Username.Value} already has access to {cluster.Name.Value}.");
            }
        }

        if (errors.Count > 0)
        {
            return GrantLookup.FieldErrors(errors);
        }

        foreach (var grant in created)
        {
            grants.Add(grant);
        }

        IReadOnlyList<Guid> ids = [.. created.Select(g => g.Id.Value)];
        return Result.Success(ids);
    }

    // One query for all item clusters; names that aren't valid cluster names can't exist and are simply not looked up.
    private async Task<Dictionary<string, Cluster>> LoadClustersAsync(
        IReadOnlyList<BulkGrantItem> items, CancellationToken cancellationToken)
    {
        var names = items
            .Select(i => ClusterName.Create(i.ClusterName))
            .Where(r => r.IsSuccess)
            .Select(r => r.Value)
            .Distinct()
            .ToList();
        var found = await clusters.GetByNamesAsync(names, cancellationToken).ConfigureAwait(false);
        return found.ToDictionary(c => c.Name.Value, StringComparer.Ordinal);
    }
}
