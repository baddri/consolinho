using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Abstractions.Persistence;

/// <summary>
/// Records when a user's host group membership was last read (<see cref="UserGroupCheck"/>, ADR-0039 §4), outside the
/// <see cref="User"/> aggregate so the <c>users</c> row and its concurrency token stay untouched.
/// </summary>
/// <remarks>
/// Upsert semantics (insert or overwrite the user's one row), safe against concurrent revalidations of the same user.
/// For a user that already exists in the database the write happens immediately, not with the command's unit of work:
/// the time is a fact about the host read, true whether or not the command later commits. For a user being created in
/// the current unit of work (first login) it is staged and committed with that user.
/// </remarks>
public interface IUserGroupCheckRecorder
{
    /// <summary>Stores <paramref name="checkedAt"/> as the user's latest group membership check.</summary>
    /// <param name="userId">The user whose groups were read.</param>
    /// <param name="checkedAt">When they were read from the host.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A task that completes when the time is written (or staged, for a new user).</returns>
    Task RecordAsync(UserId userId, DateTimeOffset checkedAt, CancellationToken cancellationToken);
}
