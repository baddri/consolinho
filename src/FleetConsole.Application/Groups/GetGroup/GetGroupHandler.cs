using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Groups.GetGroup;

/// <summary>
/// Answers <see cref="GetGroupQuery"/>: one host directory read, one grant <c>COUNT</c> and one user query
/// (<c>WHERE username IN (...)</c>) for all members together — never a query per member.
/// </summary>
/// <param name="directory">The host group directory (T-0254).</param>
/// <param name="readModel">The read model.</param>
internal sealed class GetGroupHandler(IHostGroupDirectory directory, IReadModel readModel)
    : IRequestHandler<GetGroupQuery, Result<GroupDetailDto>>
{
    /// <inheritdoc />
    public async Task<Result<GroupDetailDto>> Handle(GetGroupQuery request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // GroupName also refuses system:* names, so those are 404 as well (they are never listed).
        var parsed = GroupName.Create(request.GroupName);
        if (parsed.IsFailure)
        {
            return GroupErrors.NotFound();
        }

        var group = parsed.Value;
        var listing = await directory.GetAsync(cancellationToken).ConfigureAwait(false);
        var clusterCount = await GroupGrantCounts.OfAsync(readModel, group, cancellationToken).ConfigureAwait(false);

        var hostOk = listing.Status == HostGroupsStatus.Ok;
        var hostGroup = listing.Groups.FirstOrDefault(g => string.Equals(g.Name, group.Value, StringComparison.Ordinal));

        // Only a readable listing can prove the group doesn't exist; without it, a grant-less name is still answered
        // (with unknown host facts) rather than claimed missing.
        if (hostOk && hostGroup is null && clusterCount == 0)
        {
            return GroupErrors.NotFound();
        }

        var members = hostGroup is null ? null : await MembersAsync(hostGroup, cancellationToken).ConfigureAwait(false);
        return Result.Success(new GroupDetailDto(
            group.Value, listing.Status, listing.ReadAt, hostOk ? hostGroup is not null : null, clusterCount, members));
    }

    /// <summary>The host group's users in ordinal order, joined to FleetConsole users with one SQL statement.</summary>
    private async Task<IReadOnlyList<GroupMemberDto>> MembersAsync(HostGroup hostGroup, CancellationToken cancellationToken)
    {
        // A host username that isn't a valid FleetConsole Username can't be registered: skip it in the query, still list it.
        var candidates = hostGroup.Users
            .Select(Username.Create)
            .Where(name => name.IsSuccess)
            .Select(name => name.Value)
            .ToList();

        var registered = new Dictionary<string, (string? DisplayName, UserStatus Status)>(StringComparer.Ordinal);
        if (candidates.Count > 0)
        {
            // Status is derived like UserRow.Project (User.Status isn't mapped to a column).
            var query = readModel.Users
                .Where(u => candidates.Contains(u.Username))
                .Select(u => new
                {
                    u.Username,
                    u.DisplayName,
                    Status = u.IsDeactivated ? UserStatus.Deactivated : u.LastLoginAt == null ? UserStatus.Pending : UserStatus.Active,
                });
            foreach (var row in await readModel.ToListAsync(query, cancellationToken).ConfigureAwait(false))
            {
                registered[row.Username.Value] = (row.DisplayName, row.Status);
            }
        }

        return hostGroup.Users
            .Order(StringComparer.Ordinal)
            .Select(username => registered.TryGetValue(username, out var user)
                ? new GroupMemberDto(username, true, user.DisplayName, user.Status)
                : new GroupMemberDto(username, false, null, null))
            .ToList();
    }
}
