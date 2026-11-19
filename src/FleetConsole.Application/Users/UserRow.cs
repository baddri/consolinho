using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Auth;
using FleetConsole.Application.Users.GetUser;
using FleetConsole.Application.Users.ListUsers;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Users;

/// <summary>
/// One user as the admin queries read it: every column the list and detail representations need, with the derived
/// values (effective role, status, grant count) computed in SQL. Shared by <c>ListUsers</c> and <c>GetUser</c> so both
/// representations always agree (USR-1).
/// </summary>
/// <remarks>
/// Built only by <see cref="Project"/>, which is a single SQL statement (the grant count is a correlated subquery, so no
/// N+1). The list representation ignores <see cref="CreatedAt"/>/<see cref="CreatedBy"/>; reading two extra columns
/// is cheaper than maintaining a second projection.
/// </remarks>
internal sealed record UserRow(
    Username Username,
    string? DisplayName,
    UserRole Role,
    bool IsAdminByAssignment,
    string? AdminConfigurationSource,
    UserStatus Status,
    bool IsReadOnly,
    int GrantCount,
    DateTimeOffset? LastLoginAt,
    IReadOnlyList<string> Groups,
    DateTimeOffset CreatedAt,
    string CreatedBy,
    uint Version)
{
    /// <summary>
    /// Projects <paramref name="users"/> to rows. <see cref="User.Role"/> and <see cref="User.Status"/> are not
    /// columns, so they are spelled out from the mapped members they derive from, with the same precedence as the
    /// aggregate (ADR-0009; status: deactivated, then pending, then active).
    /// </summary>
    /// <param name="users">The users to project, already filtered (e.g. by username).</param>
    /// <param name="readModel">The read model; its grants are counted per user.</param>
    /// <returns>The composed query (not executed).</returns>
    public static IQueryable<UserRow> Project(IQueryable<User> users, IReadModel readModel)
    {
        // A local, so EF inlines the queryable as a correlated subquery rather than evaluating the property per row.
        IQueryable<Grant> grants = readModel.Grants;
        return users.Select(u => new UserRow(
            u.Username,
            u.DisplayName,
            u.IsAdminByAssignment || u.AdminConfigurationSource != null ? UserRole.Admin : UserRole.User,
            u.IsAdminByAssignment,
            u.AdminConfigurationSource,
            u.IsDeactivated ? UserStatus.Deactivated : u.LastLoginAt == null ? UserStatus.Pending : UserStatus.Active,
            u.IsReadOnly,
            grants.Count(g => g.UserId == u.Id),
            u.LastLoginAt,
            u.Groups,
            u.CreatedAt,
            u.CreatedBy,
            u.Version));
    }

    /// <summary>The list representation (<c>GET /api/admin/users</c>).</summary>
    /// <returns>The DTO.</returns>
    public UserListItemDto ToListItem() => new(
        Username.Value,
        DisplayName,
        Role,
        IsAdminViaConfiguration: AdminConfigurationSource is not null,
        IsAdminByAssignment,
        AdminConfigurationSource,
        Status,
        IsReadOnly,
        GrantCount,
        LastLoginAt,
        VisibleGroups(),
        Version);

    /// <summary>The detail representation (<c>GET /api/admin/users/{username}</c> and every user command response).</summary>
    /// <returns>The DTO.</returns>
    public UserDetailDto ToDetail() => new(
        Username.Value,
        DisplayName,
        Role,
        IsAdminViaConfiguration: AdminConfigurationSource is not null,
        IsAdminByAssignment,
        AdminConfigurationSource,
        Status,
        IsReadOnly,
        GrantCount,
        LastLoginAt,
        VisibleGroups(),
        CreatedAt,
        CreatedBy,
        Version);

    // Virtual groups are already dropped at login; filtering again keeps rows stored before that rule clean too (same as
    // GET /api/auth/me).
    private IReadOnlyList<string> VisibleGroups() => OpenShiftGroups.WithoutVirtualGroups(Groups);
}
