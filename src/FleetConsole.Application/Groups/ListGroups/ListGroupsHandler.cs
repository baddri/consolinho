using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Groups.ListGroups;

/// <summary>
/// Answers <see cref="ListGroupsQuery"/> with one host directory read (served from its snapshot) and one SQL
/// <c>GROUP BY</c> over the group grants, merged in memory by name (ordinal).
/// </summary>
/// <param name="directory">The host group directory (T-0254).</param>
/// <param name="readModel">The read model.</param>
internal sealed class ListGroupsHandler(IHostGroupDirectory directory, IReadModel readModel)
    : IRequestHandler<ListGroupsQuery, Result<GroupListDto>>
{
    private const string SystemPrefix = "system:";

    /// <inheritdoc />
    public async Task<Result<GroupListDto>> Handle(ListGroupsQuery request, CancellationToken cancellationToken)
    {
        var listing = await directory.GetAsync(cancellationToken).ConfigureAwait(false);
        var counts = await GroupGrantCounts.ByGroupAsync(readModel, cancellationToken).ConfigureAwait(false);

        // Host facts are only stated when the listing was read; otherwise they are unknown (null), not "absent".
        var hostOk = listing.Status == HostGroupsStatus.Ok;
        var onHost = listing.Groups.ToDictionary(group => group.Name, group => group.Users.Count, StringComparer.Ordinal);

        // The adapter already drops system:* host groups and GroupName refuses them for grants; filtering again keeps
        // the contract's "no system:*" independent of both (and of rows written before that rule).
        IReadOnlyList<GroupRowDto> items = onHost.Keys
            .Union(counts.Keys, StringComparer.Ordinal)
            .Where(name => !name.StartsWith(SystemPrefix, StringComparison.OrdinalIgnoreCase))
            .Order(StringComparer.Ordinal)
            .Select(name => new GroupRowDto(
                name,
                hostOk ? onHost.ContainsKey(name) : null,
                onHost.TryGetValue(name, out var members) ? members : null,
                counts.GetValueOrDefault(name)))
            .ToList();

        return Result.Success(new GroupListDto(listing.Status, listing.ReadAt, items));
    }
}
