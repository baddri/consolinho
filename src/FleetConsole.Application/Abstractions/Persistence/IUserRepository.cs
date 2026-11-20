using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Abstractions.Persistence;

/// <summary>
/// Write-side access to <see cref="User"/> aggregates for command handlers: load, check facts the aggregate needs
/// (uniqueness, last-admin count), and stage new users. Changes are committed by <c>UnitOfWorkBehavior</c> through
/// <see cref="IUnitOfWork"/>; queries read through <see cref="IReadModel"/> instead.
/// </summary>
/// <remarks>
/// Loaded aggregates are change-tracked, so mutating one and returning success is enough to persist it. Users are never
/// deleted (grants reference them with a restricting foreign key), hence no <c>Remove</c>.
/// </remarks>
public interface IUserRepository
{
    /// <summary>Loads a user by id for modification.</summary>
    /// <param name="id">The user id.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The tracked user, or <see langword="null"/> when none exists.</returns>
    Task<User?> GetByIdAsync(UserId id, CancellationToken cancellationToken);

    /// <summary>Loads a user by their natural key (exact, case-sensitive match) for modification.</summary>
    /// <param name="username">The OpenShift username.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The tracked user, or <see langword="null"/> when none exists.</returns>
    Task<User?> GetByUsernameAsync(Username username, CancellationToken cancellationToken);

    /// <summary>
    /// Whether a user with this username exists. A friendly pre-check for create/provision; the unique index on
    /// <c>users.username</c> still catches races (<see cref="DuplicateKeyException"/>).
    /// </summary>
    /// <param name="username">The OpenShift username.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns><see langword="true"/> when the username is taken.</returns>
    Task<bool> ExistsAsync(Username username, CancellationToken cancellationToken);

    /// <summary>
    /// Counts users for which <see cref="User.IsActiveWritableAdmin"/> holds: admin by assignment <em>or</em> by
    /// configuration, not deactivated and not read-only. The fact the last-admin rule (ADM-5) needs; computed in SQL.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The number of active writable admins, including the user being changed if they are one.</returns>
    Task<int> CountActiveWritableAdminsAsync(CancellationToken cancellationToken);

    /// <summary>Stages a new user (pre-created or provisioned) for insertion at commit.</summary>
    /// <param name="user">The new user.</param>
    void Add(User user);
}
