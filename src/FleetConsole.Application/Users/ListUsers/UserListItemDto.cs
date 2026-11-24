using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Users.ListUsers;

// Returned by GET /api/admin/users. Published in the OpenAPI document as the "UserListItem" schema; the XML docs below
// are written for API consumers.

/// <summary>A user as shown in the Fleet administration user list.</summary>
/// <param name="Username">The OpenShift username (exact, case-sensitive).</param>
/// <param name="DisplayName">The OpenShift full name from the last login, or null when unknown or not set.</param>
/// <param name="Role">The effective role: admin when assigned by an administrator or granted by configuration.</param>
/// <param name="IsAdminViaConfiguration">Whether configuration (user list or admin group) made the user an administrator at their last login. Such a user can't be demoted.</param>
/// <param name="IsAdminByAssignment">Whether an administrator promoted the user (or pre-created them as admin). Offer Promote when this is false.</param>
/// <param name="AdminConfigurationSource">Why configuration makes the user an administrator (the bootstrap user list or an admin group); null when it doesn't.</param>
/// <param name="Status">pending (never logged in), active, or deactivated.</param>
/// <param name="IsReadOnly">Whether the user is globally read-only.</param>
/// <param name="GrantCount">Number of clusters the user has been granted access to.</param>
/// <param name="LastLoginAt">When the user last logged in; null before the first login.</param>
/// <param name="Groups">The user's OpenShift groups at the last login (empty before the first login).</param>
/// <param name="Version">Concurrency token: send it back with every change to this user.</param>
public sealed record UserListItemDto(
    string Username,
    string? DisplayName,
    UserRole Role,
    bool IsAdminViaConfiguration,
    bool IsAdminByAssignment,
    AdminConfigurationSourceDto? AdminConfigurationSource,
    UserStatus Status,
    bool IsReadOnly,
    int GrantCount,
    DateTimeOffset? LastLoginAt,
    IReadOnlyList<string> Groups,
    uint Version);
