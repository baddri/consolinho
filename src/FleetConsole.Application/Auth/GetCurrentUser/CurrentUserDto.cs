using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Auth.GetCurrentUser;

// Returned by GET /api/auth/me. Published in the OpenAPI document as the "CurrentUser" schema; the XML docs below are
// written for API consumers.

/// <summary>The signed-in user.</summary>
/// <param name="Username">The OpenShift username.</param>
/// <param name="DisplayName">The OpenShift full name from the last login, or null when none is set.</param>
/// <param name="Role">The effective role of this session.</param>
/// <param name="IsReadOnly">Whether the user is globally read-only (administration changes are refused).</param>
/// <param name="Groups">The user's OpenShift groups at the last login (virtual system groups are not included).</param>
/// <param name="IsAdminViaConfiguration">Whether configuration (user list or admin group) makes the user an administrator.</param>
/// <param name="AdminConfigurationSource">Why configuration makes the user an administrator, e.g. "group fleetconsole-admins" or "user list"; null when it doesn't.</param>
public sealed record CurrentUserDto(
    string Username,
    string? DisplayName,
    UserRole Role,
    bool IsReadOnly,
    IReadOnlyList<string> Groups,
    bool IsAdminViaConfiguration,
    string? AdminConfigurationSource);
