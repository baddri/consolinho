using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Tests;

/// <summary>Settable <see cref="ICurrentUser"/> for behavior and handler tests.</summary>
internal sealed class FakeCurrentUser : ICurrentUser
{
    private FakeCurrentUser(UserId? userId, string? username, UserRole? role, bool isReadOnly)
    {
        UserId = userId;
        Username = username;
        Role = role;
        IsReadOnly = isReadOnly;
    }

    public static FakeCurrentUser Anonymous => new(null, null, null, false);

    public bool IsAuthenticated => UserId is not null;

    public UserId? UserId { get; }

    public string? Username { get; }

    public UserRole? Role { get; }

    public bool IsReadOnly { get; }

    public static FakeCurrentUser SignedIn(UserRole role, bool isReadOnly = false, string username = "alice") =>
        new(Domain.Users.UserId.New(), username, role, isReadOnly);

    public bool IsInRole(UserRole role) => IsAuthenticated && Role == role;
}
