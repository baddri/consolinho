using System.Diagnostics;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Grants.BulkGrant;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Grants.BulkGroupGrant;

/// <summary>
/// Handles <see cref="BulkGroupGrantCommand"/>: validates every item against the database, collects <em>all</em> item
/// problems, and only if there are none stages one group <see cref="Grant"/> per item.
/// </summary>
/// <remarks>
/// <para><b>Constant number of queries:</b> the clusters (<c>GetByNamesAsync</c>), the credentials
/// (<c>GetByIdsAsync</c>) and the group grant slots of all item clusters (<c>GetGroupGrantSlotsAsync</c>) are each read
/// once, whatever the item count.</para>
/// <para><b>All or nothing</b>, exactly like <c>BulkGrantHandler</c>: grants are only added to the repository after
/// every item passed, and <c>UnitOfWorkBehavior</c> writes them with their audit entries in one transaction.</para>
/// </remarks>
/// <param name="clusters">Cluster repository.</param>
/// <param name="credentials">Credential repository.</param>
/// <param name="grants">Grant repository.</param>
/// <param name="currentUser">The acting admin.</param>
/// <param name="clock">The clock.</param>
internal sealed class BulkGroupGrantHandler(
    IClusterRepository clusters,
    ICredentialRepository credentials,
    IGrantRepository grants,
    ICurrentUser currentUser,
    IClock clock) : IRequestHandler<BulkGroupGrantCommand, Result<IReadOnlyList<Guid>>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<Guid>>> Handle(BulkGroupGrantCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // The validator already refused invalid names; this only turns the string into the value object.
        var group = GroupName.Create(request.GroupName);
        if (group.IsFailure)
        {
            return GrantLookup.FieldErrors(new() { [nameof(BulkGroupGrantCommand.GroupName)] = [group.Error.Message] });
        }

        var clustersByName = await LoadClustersAsync(request.Items, cancellationToken).ConfigureAwait(false);
        var credentialIds = request.Items.Select(i => new CredentialId(i.CredentialId)).Distinct().ToList();
        var credentialsById = (await credentials.GetByIdsAsync(credentialIds, cancellationToken).ConfigureAwait(false))
            .ToDictionary(c => c.Id);

        // Grant.CreateForGroup checks group and priority uniqueness against these slots; a cluster's list grows with
        // every accepted item, so the rules also hold within the request (the validator already rejects duplicate
        // clusters, this keeps the domain contract honest).
        var stored = await grants
            .GetGroupGrantSlotsAsync([.. clustersByName.Values.Select(c => c.Id)], cancellationToken)
            .ConfigureAwait(false);
        var slotsByCluster = clustersByName.Values.ToDictionary(c => c.Id, c => stored[c.Id].ToList());

        var actor = GrantLookup.Actor(currentUser);
        var now = clock.UtcNow;
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        var created = new List<Grant>(request.Items.Count);
        for (var i = 0; i < request.Items.Count; i++)
        {
            var item = request.Items[i];
            var clusterField = $"{nameof(BulkGroupGrantCommand.Items)}[{i}].{nameof(BulkGrantItem.ClusterName)}";
            var credentialField = $"{nameof(BulkGroupGrantCommand.Items)}[{i}].{nameof(BulkGrantItem.CredentialId)}";

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

            var slots = slotsByCluster[cluster.Id];
            var grant = Grant.CreateForGroup(
                group.Value, cluster, credential, request.AccessMode, request.Priority, slots, actor, now);
            if (grant.IsSuccess)
            {
                slots.Add(new GroupGrantSlot(group.Value, request.Priority));
                created.Add(grant.Value);
            }
            else if (grant.Error.Code == GrantErrors.CredentialNotInCluster().Code)
            {
                errors.AddMessage(credentialField, grant.Error.Message);
            }
            else if (grant.Error.Code == GrantErrors.PriorityTaken(request.Priority, group.Value.Value).Code
                     || grant.Error.Code == GrantErrors.GroupAlreadyExists(group.Value.Value, cluster.Name.Value).Code)
            {
                // Both conflicts belong to the cluster row, so the wizard can flag it in the review step (GPG-3).
                errors.AddMessage(clusterField, grant.Error.Message);
            }
            else
            {
                // PriorityOutOfRange is refused by the validator; a new error must be mapped here deliberately.
                throw new UnreachableException($"Grant.CreateForGroup returned an unexpected error '{grant.Error.Code}'.");
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
