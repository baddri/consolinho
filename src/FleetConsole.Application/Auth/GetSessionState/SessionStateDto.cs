using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Auth.GetSessionState;

/// <summary>Current database state of a session's user (internal plumbing for revalidation, not an HTTP DTO).</summary>
/// <param name="UserId">The user id.</param>
/// <param name="Username">The username.</param>
/// <param name="Role">The effective role (assignment or configuration).</param>
/// <param name="IsReadOnly">The global read-only flag.</param>
/// <param name="IsActive">Not deactivated; a deactivated user's session is ended.</param>
/// <param name="SecurityStamp">The current stamp; a session carrying another one is ended.</param>
public sealed record SessionStateDto(UserId UserId, string Username, UserRole Role, bool IsReadOnly, bool IsActive, Guid SecurityStamp);
