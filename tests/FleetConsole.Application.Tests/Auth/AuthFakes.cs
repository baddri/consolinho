using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Tests.Auth;

/// <summary>In-memory <see cref="IUserRepository"/>: a list of users, exact username matching.</summary>
internal sealed class InMemoryUserRepository : IUserRepository
{
    public List<User> Users { get; } = [];

    public List<User> Added { get; } = [];

    public Task<User?> GetByIdAsync(UserId id, CancellationToken cancellationToken) =>
        Task.FromResult(Users.FirstOrDefault(u => u.Id == id));

    public Task<User?> GetByUsernameAsync(Username username, CancellationToken cancellationToken) =>
        Task.FromResult(Users.FirstOrDefault(u => u.Username == username));

    public Task<bool> ExistsAsync(Username username, CancellationToken cancellationToken) =>
        Task.FromResult(Users.Any(u => u.Username == username));

    public Task<int> CountActiveWritableAdminsAsync(CancellationToken cancellationToken) =>
        Task.FromResult(Users.Count(u => u.IsActiveWritableAdmin));

    public void Add(User user)
    {
        Users.Add(user);
        Added.Add(user);
    }
}

/// <summary><see cref="IReadModel"/> over in-memory lists, executed with LINQ to Objects.</summary>
internal sealed class InMemoryReadModel : IReadModel
{
    public List<User> UserRows { get; } = [];

    public IQueryable<User> Users => UserRows.AsQueryable();

    public IQueryable<Cluster> Clusters => Enumerable.Empty<Cluster>().AsQueryable();

    public IQueryable<Credential> Credentials => Enumerable.Empty<Credential>().AsQueryable();

    public IQueryable<Grant> Grants => Enumerable.Empty<Grant>().AsQueryable();

    public IQueryable<AuditEntry> AuditEntries => Enumerable.Empty<AuditEntry>().AsQueryable();

    public Task<List<T>> ToListAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.ToList());

    public Task<T?> FirstOrDefaultAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.FirstOrDefault());

    public Task<int> CountAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.Count());

    public Task<bool> AnyAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.Any());
}

/// <summary>An <see cref="ICurrentUser"/> signed in as a specific user (id and name chosen by the test).</summary>
internal sealed class SignedInAs(UserId userId, string username, UserRole role, bool isReadOnly = false) : ICurrentUser
{
    public bool IsAuthenticated => true;

    public UserId? UserId => userId;

    public string? Username => username;

    public bool IsReadOnly => isReadOnly;

    public bool IsInRole(UserRole r) => r == role;
}

/// <summary>Builders for users in a given state.</summary>
internal static class AuthTestUsers
{
    public static readonly DateTimeOffset Earlier = new(2026, 11, 1, 8, 0, 0, TimeSpan.Zero);

    public static Username Name(string value) => Username.Create(value).Value;

    public static User PreCreated(string username, UserRole role = UserRole.User, bool isReadOnly = false)
    {
        var user = User.PreCreate(Name(username), role, isReadOnly, "root", Earlier);
        user.ClearDomainEvents();
        return user;
    }

    public static User Deactivated(string username)
    {
        var user = PreCreated(username);
        user.Deactivate(Domain.Users.UserId.New(), activeWritableAdminCount: 5).IsSuccess.ShouldBeTrue();
        user.ClearDomainEvents();
        return user;
    }

    /// <summary>A user who logged in before with <paramref name="adminSource"/> as configuration source.</summary>
    public static User LoggedInBefore(string username, string? adminSource, bool assignedAdmin = false)
    {
        var user = PreCreated(username, assignedAdmin ? UserRole.Admin : UserRole.User);
        user.RecordLogin("Old Name", ["old-group"], adminSource, provisioned: false, Earlier).IsSuccess.ShouldBeTrue();
        user.ClearDomainEvents();
        return user;
    }
}
