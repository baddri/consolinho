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

    /// <summary>
    /// A Kubernetes resource (or non-resource path) in a managed cluster, addressed by a proxied mutation
    /// (ADR-0021). Has no target id; the target name is the kubectl-style display name.
    /// </summary>
    KubernetesResource = 5,
}
