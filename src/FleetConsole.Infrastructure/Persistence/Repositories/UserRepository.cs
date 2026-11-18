using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace FleetConsole.Infrastructure.Persistence.Repositories;

/// <summary>EF Core implementation of <see cref="IUserRepository"/> over the request's <see cref="ConsoleDbContext"/>.</summary>
/// <param name="db">The scoped context, shared with the unit of work.</param>
internal sealed class UserRepository(ConsoleDbContext db) : IUserRepository
{
    /// <inheritdoc />
    public Task<User?> GetByIdAsync(UserId id, CancellationToken cancellationToken) =>
        db.Set<User>().SingleOrDefaultAsync(u => u.Id == id, cancellationToken);

    /// <inheritdoc />
    public Task<User?> GetByUsernameAsync(Username username, CancellationToken cancellationToken) =>
        db.Set<User>().SingleOrDefaultAsync(u => u.Username == username, cancellationToken);

    /// <inheritdoc />
    public Task<bool> ExistsAsync(Username username, CancellationToken cancellationToken) =>
        db.Set<User>().AnyAsync(u => u.Username == username, cancellationToken);

    /// <inheritdoc />
    public Task<int> CountActiveWritableAdminsAsync(CancellationToken cancellationToken) =>
        // Same rule as User.IsActiveWritableAdmin, spelled out over mapped columns so it runs in SQL.
        db.Set<User>().CountAsync(
            u => (u.IsAdminByAssignment || u.AdminConfigurationSource != null) && !u.IsDeactivated && !u.IsReadOnly,
            cancellationToken);

    /// <inheritdoc />
    public void Add(User user) => db.Set<User>().Add(user);
}
