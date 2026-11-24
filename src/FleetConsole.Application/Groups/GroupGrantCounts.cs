using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Access;

namespace FleetConsole.Application.Groups;

/// <summary>
/// Counts group grants per group name for the Groups pages: the "Clusters" column is the number of group grants (a
/// group has at most one grant per cluster, so it equals the number of clusters it can reach).
/// </summary>
internal static class GroupGrantCounts
{
    /// <summary>All groups that are the subject of at least one grant, with their grant count, in one <c>GROUP BY</c>.</summary>
    /// <param name="readModel">The read model.</param>
    /// <param name="cancellationToken">Cancels the query.</param>
    /// <returns>Grant count by group name (ordinal keys).</returns>
    public static async Task<Dictionary<string, int>> ByGroupAsync(IReadModel readModel, CancellationToken cancellationToken)
    {
        var query = readModel.Grants
            .Where(g => g.SubjectKind == GrantSubjectKind.Group)
            .GroupBy(g => g.GroupName!)
            .Select(group => new { Group = group.Key, Count = group.Count() });
        var rows = await readModel.ToListAsync(query, cancellationToken).ConfigureAwait(false);
        return rows.ToDictionary(row => row.Group.Value, row => row.Count, StringComparer.Ordinal);
    }

    /// <summary>The number of grants of one group (one <c>COUNT</c>).</summary>
    /// <param name="readModel">The read model.</param>
    /// <param name="group">The group.</param>
    /// <param name="cancellationToken">Cancels the query.</param>
    /// <returns>The grant count; 0 for a group without grants.</returns>
    public static Task<int> OfAsync(IReadModel readModel, GroupName group, CancellationToken cancellationToken) =>
        readModel.CountAsync(readModel.Grants.Where(g => g.GroupName == group), cancellationToken);
}
