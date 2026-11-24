using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace FleetConsole.Infrastructure.Persistence.Repositories;

/// <summary>
/// EF Core implementation of <see cref="IUserGroupCheckRecorder"/>: an <c>INSERT … ON CONFLICT (user_id) DO UPDATE</c>
/// on <c>user_group_checks</c>, executed immediately, so the <c>users</c> row (and its <c>xmin</c>) is never touched and
/// concurrent revalidations of one user can't collide (ADR-0039 §4).
/// </summary>
/// <remarks>
/// A user added to the context but not yet saved (first login, auto-provisioning) has no row the foreign key could
/// reference, so for that user the check is staged as an entity instead and committed by the same unit of work, after
/// the user row (EF orders the inserts by the relationship).
/// </remarks>
/// <param name="db">The scoped context shared with the command's repositories.</param>
internal sealed class UserGroupCheckRecorder(ConsoleDbContext db) : IUserGroupCheckRecorder
{
    /// <inheritdoc />
    public async Task RecordAsync(UserId userId, DateTimeOffset checkedAt, CancellationToken cancellationToken)
    {
        var userIsNew = db.ChangeTracker.Entries<User>()
            .Any(entry => entry.State == EntityState.Added && entry.Entity.Id == userId);
        if (userIsNew)
        {
            db.Add(new UserGroupCheck(userId, checkedAt));
            return;
        }

        // Interpolated values become parameters. Table/column names are fixed (snake_case naming convention).
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO user_group_checks (user_id, checked_at) VALUES ({userId.Value}, {checkedAt})
            ON CONFLICT (user_id) DO UPDATE SET checked_at = EXCLUDED.checked_at
            """,
            cancellationToken).ConfigureAwait(false);
    }
}
