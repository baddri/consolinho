namespace FleetConsole.Domain.Access;

/// <summary>
/// One existing group grant on a cluster, as far as the group-grant invariants care: which group holds it and with
/// which priority. Handlers read the cluster's slots and pass them to <see cref="Grant.CreateForGroup"/> /
/// <see cref="Grant.ChangeGroupGrant"/> (BACKEND.md, "cross-aggregate rules"), so one group per cluster (GRP-5) and one
/// group per priority per cluster (GRP-4) are checked without the aggregate reading the database.
/// </summary>
/// <param name="Group">The group holding the grant.</param>
/// <param name="Priority">The grant's priority.</param>
public sealed record GroupGrantSlot(GroupName Group, int Priority);
