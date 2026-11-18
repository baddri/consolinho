namespace FleetConsole.Domain.Audit;

/// <summary>
/// Coarse grouping of audit entries for the audit-log filter (AUD-4). Derived from the action prefix by
/// <see cref="AuditEntry.Record"/>, never chosen by callers, so category and action cannot disagree.
/// </summary>
public enum AuditCategory
{
    /// <summary>Login, denied login and logout (<c>auth.*</c>).</summary>
    Auth = 0,

    /// <summary>User administration (<c>user.*</c>).</summary>
    Users = 1,

    /// <summary>Cluster registration and settings (<c>cluster.*</c>).</summary>
    Clusters = 2,

    /// <summary>ServiceAccount credentials and connection tests (<c>credential.*</c>).</summary>
    Credentials = 3,

    /// <summary>Cluster access grants (<c>grant.*</c>).</summary>
    Grants = 4,
}
