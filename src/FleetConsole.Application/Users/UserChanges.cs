using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Users;

/// <summary>
/// The steps every user transition handler (role, read-only, deactivate, reactivate) takes before calling the aggregate:
/// resolve the route's username, load the user and check the client's <c>version</c> (ADR-0013 §4). Kept here so the
/// four handlers only contain the call that differs.
/// </summary>
internal static class UserChanges
{
    /// <summary>
    /// The resource-specific optimistic concurrency error (contract §2). <c>UnitOfWorkBehavior</c> returns the generic
    /// <see cref="PersistenceErrors.ConcurrencyConflict"/> for races at commit time; this one is for a stale
    /// <c>version</c> the handler can see.
    /// </summary>
    public static Error ConcurrencyConflict { get; } =
        Error.Conflict("Concurrency.Conflict", "This user was changed by someone else. Reload and try again.");

    /// <summary>
    /// Loads the user named in the route for modification and checks <paramref name="expectedVersion"/>.
    /// </summary>
    /// <param name="users">The repository (tracked load).</param>
    /// <param name="username">The username from the route. A value that is not a valid username can't name an existing
    /// user, so it is a 404 like any unknown one (ADR-0013 §8: unknown route ids → 404).</param>
    /// <param name="expectedVersion">The <c>version</c> the client last saw.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The tracked user, or <see cref="UserErrors.NotFound"/>, or <see cref="ConcurrencyConflict"/>.</returns>
    public static async Task<Result<User>> LoadAsync(
        IUserRepository users, string username, uint expectedVersion, CancellationToken cancellationToken)
    {
        var name = Username.Create(username);
        if (name.IsFailure)
        {
            return UserErrors.NotFound(username);
        }

        var user = await users.GetByUsernameAsync(name.Value, cancellationToken).ConfigureAwait(false);
        if (user is null)
        {
            return UserErrors.NotFound(username);
        }

        // Checked before any rule so a client acting on stale data is told to reload rather than shown a rule failure
        // that may no longer apply.
        return user.Version == expectedVersion ? Result.Success(user) : Result.Failure<User>(ConcurrencyConflict);
    }
}
