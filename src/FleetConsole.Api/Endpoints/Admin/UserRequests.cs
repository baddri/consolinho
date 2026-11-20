using FleetConsole.Domain.Users;

namespace FleetConsole.Api.Endpoints.Admin;

// Request bodies of the user administration endpoints (contract §7.2). Published in the OpenAPI document; the XML docs
// are written for API consumers. Body-less transitions (deactivate, reactivate) use VersionRequest.

/// <summary>Pre-creates a user before their first login.</summary>
/// <param name="Username">The OpenShift username, exactly as OpenShift reports it: 1 to 253 characters, case-sensitive, without '/', '%', whitespace or control characters, and not '.', '..' or '~'.</param>
/// <param name="Role">The initial role (default user).</param>
/// <param name="IsReadOnly">Whether the user starts globally read-only (default false).</param>
public sealed record CreateUserRequest(string Username, UserRole Role = UserRole.User, bool IsReadOnly = false);

/// <summary>Promotes (admin) or demotes (user) a user.</summary>
/// <param name="Role">The requested role.</param>
/// <param name="Version">The user's version from its last representation.</param>
public sealed record ChangeUserRoleRequest(UserRole Role, uint Version);

/// <summary>Sets or clears a user's global read-only flag.</summary>
/// <param name="IsReadOnly">The requested value.</param>
/// <param name="Version">The user's version from its last representation.</param>
public sealed record SetUserReadOnlyRequest(bool IsReadOnly, uint Version);
