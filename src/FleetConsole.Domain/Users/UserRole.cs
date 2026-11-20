namespace FleetConsole.Domain.Users;

// The <summary> is published as the OpenAPI description of the UserRole schema (and in the SPA's generated types):
// keep it consumer-facing, plain text, no cref. Implementation notes belong in <remarks>.

/// <summary>
/// The user's effective FleetConsole role: admin if assigned by an administrator or granted by configuration, otherwise
/// user.
/// </summary>
/// <remarks>
/// Never stored directly: <see cref="User.Role"/> derives it from the two admin sources (assignment by an admin, or
/// configuration at login, ADR-0009). Serialized as camelCase JSON strings (<c>user</c>, <c>admin</c>) and used by
/// <c>IRequireRole</c> in the Application layer.
/// </remarks>
public enum UserRole
{
    /// <summary>Regular user: may use the clusters they were granted, no access to Administration.</summary>
    User = 0,

    /// <summary>Administrator: manages users, clusters, credentials and grants (unless read-only, ADM-2).</summary>
    Admin = 1,
}
