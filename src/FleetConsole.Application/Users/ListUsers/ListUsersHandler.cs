using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Users.ListUsers;

/// <summary>Answers <see cref="ListUsersQuery"/> with one SQL statement (<see cref="UserRow.Project"/>).</summary>
internal sealed class ListUsersHandler(IReadModel readModel)
    : IRequestHandler<ListUsersQuery, Result<IReadOnlyList<UserListItemDto>>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<UserListItemDto>>> Handle(ListUsersQuery request, CancellationToken cancellationToken)
    {
        var rows = await readModel.ToListAsync(UserRow.Project(readModel.Users, readModel), cancellationToken)
            .ConfigureAwait(false);

        // Sorted in memory with ordinal comparison: the contract's "sorted by username" must not depend on the database
        // collation, and usernames are case-sensitive keys.
        IReadOnlyList<UserListItemDto> items = rows
            .OrderBy(r => r.Username.Value, StringComparer.Ordinal)
            .Select(r => r.ToListItem())
            .ToList();
        return Result.Success(items);
    }
}
