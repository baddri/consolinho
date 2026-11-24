using FleetConsole.Domain.Access.Events;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Domain.Access;

/// <summary>
/// A user's or a host group's access to one cluster (GRANT-1, ADR-0034): which credential's token the proxy uses on
/// that cluster, and whether mutations are allowed (<see cref="AccessMode"/>). Admins need grants too; the admin role
/// gives no cluster access (GRANT-6).
/// </summary>
/// <remarks>
/// <para><b>Subject.</b> <see cref="SubjectKind"/> says whether the grant is for one user (<see cref="UserId"/> set) or
/// for every member of a host group (<see cref="GroupName"/> and <see cref="Priority"/> set); exactly one of the two
/// shapes holds, and a database check constraint mirrors it. Which grant wins for a user is decided by the access
/// resolver (ADR-0034 §4), not here.</para>
/// <para><b>Invariants.</b> At most one grant per (user, cluster) and per (group, cluster); at most one group grant per
/// (cluster, priority); the credential belongs to the grant's cluster. The uniqueness rules need data from the
/// database, so the factories take the facts as arguments (BACKEND.md, "cross-aggregate rules"); unique indexes back
/// them up against races.</para>
/// <para><b>Fixed pair.</b> The subject and <see cref="ClusterId"/> never change; moving access to another cluster (or
/// subject) is revoke + create.</para>
/// <para><b>State is kept (GRANT-5).</b> Grants may be created and kept for deactivated users, disabled clusters and
/// expired credentials; the UI marks them.</para>
/// </remarks>
public sealed class Grant : AggregateRoot<GrantId>
{
    /// <summary>Lowest priority a group grant may have (GRP-2).</summary>
    public const int MinPriority = 1;

    /// <summary>Highest priority a group grant may have (GRP-2); higher wins (ADR-0034 §4).</summary>
    public const int MaxPriority = 1000;

    /// <summary>Parameterless constructor for EF Core materialization only.</summary>
    private Grant()
    {
    }

    private Grant(GrantId id, ClusterId clusterId, string grantedBy, DateTimeOffset grantedAt)
        : base(id)
    {
        ClusterId = clusterId;
        GrantedBy = grantedBy;
        GrantedAt = grantedAt;
    }

    /// <summary>Whether the grant is for a user or a group. Immutable.</summary>
    public GrantSubjectKind SubjectKind { get; private init; }

    /// <summary>The granted user for a <see cref="GrantSubjectKind.User"/> grant; <see langword="null"/> for a group
    /// grant. Immutable.</summary>
    public UserId? UserId { get; private init; }

    /// <summary>The granted host group for a <see cref="GrantSubjectKind.Group"/> grant; <see langword="null"/> for a
    /// user grant. Immutable.</summary>
    public GroupName? GroupName { get; private init; }

    /// <summary>
    /// The group grant's rank among the cluster's group grants (<see cref="MinPriority"/>..<see cref="MaxPriority"/>,
    /// unique per cluster, higher wins); <see langword="null"/> for a user grant, which beats every group grant anyway.
    /// </summary>
    public int? Priority { get; private set; }

    /// <summary>The cluster the grant gives access to. Immutable.</summary>
    public ClusterId ClusterId { get; private init; }

    /// <summary>The credential whose token is used for this user on <see cref="ClusterId"/>; always one of that cluster.</summary>
    public CredentialId CredentialId { get; private set; }

    /// <summary>Whether mutations are allowed through the proxy.</summary>
    public AccessMode AccessMode { get; private set; }

    /// <summary>When the grant was created.</summary>
    public DateTimeOffset GrantedAt { get; private init; }

    /// <summary>Username of the admin who created the grant.</summary>
    public string GrantedBy { get; private init; } = null!;

    /// <summary>When an admin last changed the grant; <see langword="null"/> if never.</summary>
    public DateTimeOffset? UpdatedAt { get; private set; }

    /// <summary>Username of the admin who last changed the grant; <see langword="null"/> if never.</summary>
    public string? UpdatedBy { get; private set; }

    /// <summary>
    /// Gives <paramref name="user"/> access to <paramref name="cluster"/> with <paramref name="credential"/> (GRANT-2, and
    /// per item of a bulk grant, GRANT-4). Raises <see cref="GrantCreated"/>.
    /// </summary>
    /// <param name="user">The user to grant access to (may be deactivated, GRANT-5).</param>
    /// <param name="cluster">The cluster (may be disabled, GRANT-5).</param>
    /// <param name="credential">The credential to use; must belong to <paramref name="cluster"/>.</param>
    /// <param name="mode">The access mode.</param>
    /// <param name="clustersUserAlreadyHasGrantsOn">The clusters on which <paramref name="user"/> already has a grant (read
    /// by the handler; for a bulk grant, include the clusters granted by earlier items of the same request).</param>
    /// <param name="actor">Username of the acting admin.</param>
    /// <param name="now">Current time (from <c>IClock</c>).</param>
    /// <returns>The grant, or, checked in this order, <see cref="GrantErrors.CredentialNotInCluster"/> (invalid input) and
    /// <see cref="GrantErrors.AlreadyExists"/> (conflict with existing state).</returns>
    public static Result<Grant> Create(
        User user,
        Cluster cluster,
        Credential credential,
        AccessMode mode,
        IReadOnlySet<ClusterId> clustersUserAlreadyHasGrantsOn,
        string actor,
        DateTimeOffset now)
    {
        Guard.NotNull(user);
        Guard.NotNull(cluster);
        Guard.NotNull(credential);
        Guard.NotNull(clustersUserAlreadyHasGrantsOn);
        Guard.NotNullOrWhiteSpace(actor);
        Guard.NotDefault(now);
        CheckMode(mode);

        if (credential.ClusterId != cluster.Id)
        {
            return GrantErrors.CredentialNotInCluster();
        }

        if (clustersUserAlreadyHasGrantsOn.Contains(cluster.Id))
        {
            return GrantErrors.AlreadyExists(user.Username.Value, cluster.Name.Value);
        }

        var grant = new Grant(GrantId.New(), cluster.Id, actor, now)
        {
            SubjectKind = GrantSubjectKind.User,
            UserId = user.Id,
            CredentialId = credential.Id,
            AccessMode = mode,
        };
        grant.RaiseDomainEvent(new GrantCreated(
            grant.Id, user.Id, user.Username.Value, cluster.Id, cluster.Name.Value, credential.Id, credential.Name.Value,
            mode, GrantSubjectKind.User, Priority: null));
        return grant;
    }

    /// <summary>
    /// Gives every member of the host group <paramref name="group"/> access to <paramref name="cluster"/> with
    /// <paramref name="credential"/> at <paramref name="priority"/> (GRP-1, and per item of a bulk group grant). Raises
    /// <see cref="GrantCreated"/>.
    /// </summary>
    /// <param name="group">The host group (validated by <see cref="Access.GroupName.Create"/>).</param>
    /// <param name="cluster">The cluster (may be disabled, GRANT-5).</param>
    /// <param name="credential">The credential to use; must belong to <paramref name="cluster"/>.</param>
    /// <param name="mode">The access mode.</param>
    /// <param name="priority">The rank among the cluster's group grants, <see cref="MinPriority"/>..<see cref="MaxPriority"/>.</param>
    /// <param name="groupGrantsOnCluster">The cluster's existing group grants (read by the handler; for a bulk grant,
    /// include the grants created by earlier items of the same request).</param>
    /// <param name="actor">Username of the acting admin.</param>
    /// <param name="now">Current time (from <c>IClock</c>).</param>
    /// <returns>The grant, or, checked in this order, <see cref="GrantErrors.CredentialNotInCluster"/>,
    /// <see cref="GrantErrors.PriorityOutOfRange"/> (invalid input), <see cref="GrantErrors.GroupAlreadyExists"/>
    /// (GRP-5) and <see cref="GrantErrors.PriorityTaken"/> (GRP-4; conflicts with existing state).</returns>
    public static Result<Grant> CreateForGroup(
        GroupName group,
        Cluster cluster,
        Credential credential,
        AccessMode mode,
        int priority,
        IReadOnlyCollection<GroupGrantSlot> groupGrantsOnCluster,
        string actor,
        DateTimeOffset now)
    {
        Guard.NotNull(group);
        Guard.NotNull(cluster);
        Guard.NotNull(credential);
        Guard.NotNull(groupGrantsOnCluster);
        Guard.NotNullOrWhiteSpace(actor);
        Guard.NotDefault(now);
        CheckMode(mode);

        if (credential.ClusterId != cluster.Id)
        {
            return GrantErrors.CredentialNotInCluster();
        }

        if (priority is < MinPriority or > MaxPriority)
        {
            return GrantErrors.PriorityOutOfRange();
        }

        if (groupGrantsOnCluster.Any(slot => slot.Group == group))
        {
            return GrantErrors.GroupAlreadyExists(group.Value, cluster.Name.Value);
        }

        if (FindPriorityHolder(groupGrantsOnCluster, priority) is { } holder)
        {
            return GrantErrors.PriorityTaken(priority, holder.Group.Value);
        }

        var grant = new Grant(GrantId.New(), cluster.Id, actor, now)
        {
            SubjectKind = GrantSubjectKind.Group,
            GroupName = group,
            Priority = priority,
            CredentialId = credential.Id,
            AccessMode = mode,
        };
        grant.RaiseDomainEvent(new GrantCreated(
            grant.Id, UserId: null, group.Value, cluster.Id, cluster.Name.Value, credential.Id, credential.Name.Value,
            mode, GrantSubjectKind.Group, priority));
        return grant;
    }

    /// <summary>
    /// Changes a <em>user</em> grant's access mode and/or credential (GRANT-3); group grants use
    /// <see cref="ChangeGroupGrant"/>. Raises <see cref="GrantChanged"/>, or nothing when both
    /// already have the requested values.
    /// </summary>
    /// <param name="mode">The requested access mode.</param>
    /// <param name="newCredential">The requested credential (may be the current one); must belong to the grant's cluster.</param>
    /// <param name="current">Display names for the audit entry; <see cref="GrantLabels.CredentialName"/> is the name of
    /// the credential the grant uses <em>before</em> the change.</param>
    /// <param name="actor">Username of the acting admin.</param>
    /// <param name="now">Current time (from <c>IClock</c>).</param>
    /// <returns>Success, or <see cref="GrantErrors.CredentialNotInCluster"/> (nothing changes then).</returns>
    /// <exception cref="InvalidOperationException">The grant is a group grant (a caller bug: the priority would be
    /// silently kept).</exception>
    public Result Change(AccessMode mode, Credential newCredential, GrantLabels current, string actor, DateTimeOffset now)
    {
        if (SubjectKind != GrantSubjectKind.User)
        {
            throw new InvalidOperationException("Change applies to user grants only; use ChangeGroupGrant for group grants.");
        }

        Guard.NotNull(newCredential);
        Guard.NotNull(current);
        Guard.NotNullOrWhiteSpace(actor);
        Guard.NotDefault(now);
        CheckMode(mode);

        if (newCredential.ClusterId != ClusterId)
        {
            return GrantErrors.CredentialNotInCluster();
        }

        if (mode == AccessMode && newCredential.Id == CredentialId)
        {
            return Result.Success();
        }

        var oldMode = AccessMode;
        var oldCredentialId = CredentialId;
        AccessMode = mode;
        CredentialId = newCredential.Id;
        UpdatedAt = now;
        UpdatedBy = actor;
        RaiseDomainEvent(new GrantChanged(
            Id, UserId, current.SubjectName, ClusterId, current.ClusterName,
            oldMode, mode, oldCredentialId, current.CredentialName, newCredential.Id, newCredential.Name.Value,
            GrantSubjectKind.User, OldPriority: null, NewPriority: null));
        return Result.Success();
    }

    /// <summary>
    /// Changes a <em>group</em> grant's access mode, credential and/or priority (GRANT-3, GRP-4). Raises
    /// <see cref="GrantChanged"/>, or nothing when all three already have the requested values.
    /// </summary>
    /// <param name="mode">The requested access mode.</param>
    /// <param name="newCredential">The requested credential (may be the current one); must belong to the grant's cluster.</param>
    /// <param name="priority">The requested priority, <see cref="MinPriority"/>..<see cref="MaxPriority"/>.</param>
    /// <param name="otherGroupGrantsOnCluster">The cluster's group grants (read by the handler). A slot of this grant's
    /// own group is ignored, so passing all of the cluster's slots is fine: keeping the own priority is never taken.</param>
    /// <param name="current">Display names for the audit entry; <see cref="GrantLabels.CredentialName"/> is the name of
    /// the credential the grant uses <em>before</em> the change.</param>
    /// <param name="actor">Username of the acting admin.</param>
    /// <param name="now">Current time (from <c>IClock</c>).</param>
    /// <returns>Success, or, checked in this order, <see cref="GrantErrors.CredentialNotInCluster"/>,
    /// <see cref="GrantErrors.PriorityOutOfRange"/> and <see cref="GrantErrors.PriorityTaken"/> (nothing changes then).</returns>
    /// <exception cref="InvalidOperationException">The grant is a user grant (a caller bug).</exception>
    public Result ChangeGroupGrant(
        AccessMode mode,
        Credential newCredential,
        int priority,
        IReadOnlyCollection<GroupGrantSlot> otherGroupGrantsOnCluster,
        GrantLabels current,
        string actor,
        DateTimeOffset now)
    {
        if (SubjectKind != GrantSubjectKind.Group)
        {
            throw new InvalidOperationException("ChangeGroupGrant applies to group grants only; use Change for user grants.");
        }

        Guard.NotNull(newCredential);
        Guard.NotNull(otherGroupGrantsOnCluster);
        Guard.NotNull(current);
        Guard.NotNullOrWhiteSpace(actor);
        Guard.NotDefault(now);
        CheckMode(mode);

        if (newCredential.ClusterId != ClusterId)
        {
            return GrantErrors.CredentialNotInCluster();
        }

        if (priority is < MinPriority or > MaxPriority)
        {
            return GrantErrors.PriorityOutOfRange();
        }

        var others = otherGroupGrantsOnCluster.Where(slot => slot.Group != GroupName).ToList();
        if (FindPriorityHolder(others, priority) is { } holder)
        {
            return GrantErrors.PriorityTaken(priority, holder.Group.Value);
        }

        if (mode == AccessMode && newCredential.Id == CredentialId && priority == Priority)
        {
            return Result.Success();
        }

        var oldMode = AccessMode;
        var oldCredentialId = CredentialId;
        var oldPriority = Priority;
        AccessMode = mode;
        CredentialId = newCredential.Id;
        Priority = priority;
        UpdatedAt = now;
        UpdatedBy = actor;
        RaiseDomainEvent(new GrantChanged(
            Id, UserId: null, current.SubjectName, ClusterId, current.ClusterName,
            oldMode, mode, oldCredentialId, current.CredentialName, newCredential.Id, newCredential.Name.Value,
            GrantSubjectKind.Group, oldPriority, priority));
        return Result.Success();
    }

    /// <summary>
    /// Records that the grant is being revoked (GRANT-3) by raising <see cref="GrantRevoked"/>; the handler then removes
    /// the aggregate. Revoke takes no version and has no failure cases.
    /// </summary>
    /// <param name="labels">Display names for the audit entry.</param>
    public void Revoke(GrantLabels labels)
    {
        Guard.NotNull(labels);

        RaiseDomainEvent(new GrantRevoked(
            Id, UserId, labels.SubjectName, ClusterId, labels.ClusterName, CredentialId, labels.CredentialName, AccessMode,
            SubjectKind, Priority));
    }

    private static GroupGrantSlot? FindPriorityHolder(IEnumerable<GroupGrantSlot> slots, int priority) =>
        slots.FirstOrDefault(slot => slot.Priority == priority);

    private static void CheckMode(AccessMode mode)
    {
        if (!Enum.IsDefined(mode))
        {
            throw new ArgumentOutOfRangeException(nameof(mode), mode, "Unknown access mode.");
        }
    }
}
