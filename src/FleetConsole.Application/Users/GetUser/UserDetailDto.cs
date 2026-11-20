using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Users.GetUser;

// Returned by GET /api/admin/users/{username} and by every user command. Published in the OpenAPI document as the
// "UserDetail" schema; the XML docs below are written for API consumers.

/// <summary>A user with everything the Fleet administration user detail page shows.</summary>
/// <param name="Username">The OpenShift username (exact, case-sensitive).</param>
/// <param name="DisplayName">The OpenShift full name from the last login, or null when unknown or not set.</param>
/// <param name="Role">The effective role: admin when assigned by an administrator or granted by configuration.</param>
/// <param name="IsAdminViaConfiguration">Whether configuration (user list or admin group) made the user an administrator at their last login. Such a user can't be demoted.</param>
/// <param name="IsAdminByAssignment">Whether an administrator promoted the user (or pre-created them as admin). Offer Promote when this is false.</param>
/// <param name="AdminConfigurationSource">Why configuration makes the user an administrator, e.g. "group fleetconsole-admins" or "user list"; null when it doesn't.</param>
/// <param name="Status">pending (never logged in), active, or deactivated.</param>
/// <param name="IsReadOnly">Whether the user is globally read-only.</param>
/// <param name="GrantCount">Number of clusters the user has been granted access to.</param>
/// <param name="LastLoginAt">When the user last logged in; null before the first login.</param>
/// <param name="Groups">The user's OpenShift groups at the last login (empty before the first login).</param>
/// <param name="CreatedAt">When the user record was created.</param>
/// <param name="CreatedBy">The administrator who pre-created the user, or the user's own name when created at their first login.</param>
/// <param name="Version">Concurrency token: send it back with every change to this user.</param>
public sealed record UserDetailDto(
    string Username,
    string? DisplayName,
    UserRole Role,
    bool IsAdminViaConfiguration,
    bool IsAdminByAssignment,
    string? AdminConfigurationSource,
    UserStatus Status,
    bool IsReadOnly,
    int GrantCount,
    DateTimeOffset? LastLoginAt,
    IReadOnlyList<string> Groups,
    DateTimeOffset CreatedAt,
    string CreatedBy,
    uint Version);
