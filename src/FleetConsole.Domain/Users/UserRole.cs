namespace FleetConsole.Domain.Users;

/// <summary>
/// A user's <em>effective</em> FleetConsole role. It is never stored directly: <see cref="User.Role"/> derives it from
/// the two admin sources (assignment by an admin, or configuration at login, ADR-0009). Serialized as camelCase JSON
/// strings (<c>user</c>, <c>admin</c>) and used by <c>IRequireRole</c> in the Application layer.
/// </summary>
public enum UserRole
{
    /// <summary>Regular user: may use the clusters they were granted, no access to Administration.</summary>
    User = 0,

    /// <summary>Administrator: manages users, clusters, credentials and grants (unless read-only, ADM-2).</summary>
    Admin = 1,
}
