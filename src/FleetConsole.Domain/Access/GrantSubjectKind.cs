namespace FleetConsole.Domain.Access;

/// <summary>
/// Who a <see cref="Grant"/> is for (ADR-0034 §1): one FleetConsole user, or every member of a host OpenShift group.
/// Decides which of <see cref="Grant.UserId"/> and <see cref="Grant.GroupName"/> is set and whether the grant has a
/// <see cref="Grant.Priority"/>.
/// </summary>
public enum GrantSubjectKind
{
    /// <summary>A direct grant to one user; beats any group grant on the same cluster (ADR-0034 §4).</summary>
    User = 0,

    /// <summary>A grant to a host group, ranked against the cluster's other group grants by priority.</summary>
    Group = 1,
}
