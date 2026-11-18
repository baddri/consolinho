namespace FleetConsole.Domain.Audit;

/// <summary>The kind of object an audit entry is about; tells the UI how to interpret <see cref="AuditEntry.TargetId"/>.</summary>
public enum AuditTargetType
{
    /// <summary>A login session (auth actions).</summary>
    Session = 0,

    /// <summary>A FleetConsole user.</summary>
    User = 1,

    /// <summary>A managed cluster.</summary>
    Cluster = 2,

    /// <summary>A ServiceAccount credential of a cluster.</summary>
    Credential = 3,

    /// <summary>A user's access grant to a cluster.</summary>
    Grant = 4,
}
