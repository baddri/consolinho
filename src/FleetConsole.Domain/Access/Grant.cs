using FleetConsole.Domain.Access.Events;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Domain.Access;

/// <summary>
/// A user's access to one cluster (GRANT-1): which credential's token the proxy uses for the user on that cluster, and
/// whether mutations are allowed (<see cref="AccessMode"/>). Admins need grants too; the admin role gives no cluster
/// access (GRANT-6).
/// </summary>
/// <remarks>
/// <para><b>Invariants.</b> At most one grant per (user, cluster); the credential belongs to the grant's cluster. The
/// first needs data from the database, so <see cref="Create"/> takes the set of clusters the user already has grants on
/// (BACKEND.md, "cross-aggregate rules"); a unique index on (user, cluster) backs it up against races.</para>
/// <para><b>Fixed pair.</b> <see cref="UserId"/> and <see cref="ClusterId"/> never change; moving access to another
/// cluster is revoke + create.</para>
/// <para><b>State is kept (GRANT-5).</b> Grants may be created and kept for deactivated users, disabled clusters and
/// expired credentials; the UI marks them.</para>
/// </remarks>
public sealed class Grant : AggregateRoot<GrantId>
{
    /// <summary>Parameterless constructor for EF Core materialization only.</summary>
    private Grant()
    {
    }

    private Grant(GrantId id, UserId userId, ClusterId clusterId, string grantedBy, DateTimeOffset grantedAt)
        : base(id)
    {
        UserId = userId;
        ClusterId = clusterId;
        GrantedBy = grantedBy;
        GrantedAt = grantedAt;
    }

    /// <summary>The granted user. Immutable.</summary>
    public UserId UserId { get; private init; }

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

        var grant = new Grant(GrantId.New(), user.Id, cluster.Id, actor, now)
        {
            CredentialId = credential.Id,
            AccessMode = mode,
        };
        grant.RaiseDomainEvent(new GrantCreated(
            grant.Id, user.Id, user.Username.Value, cluster.Id, cluster.Name.Value, credential.Id, credential.Name.Value,
            mode));
        return grant;
    }

    /// <summary>
    /// Changes the access mode and/or the credential (GRANT-3). Raises <see cref="GrantChanged"/>, or nothing when both
    /// already have the requested values.
    /// </summary>
    /// <param name="mode">The requested access mode.</param>
    /// <param name="newCredential">The requested credential (may be the current one); must belong to the grant's cluster.</param>
    /// <param name="current">Display names for the audit entry; <see cref="GrantLabels.CredentialName"/> is the name of
    /// the credential the grant uses <em>before</em> the change.</param>
    /// <param name="actor">Username of the acting admin.</param>
    /// <param name="now">Current time (from <c>IClock</c>).</param>
    /// <returns>Success, or <see cref="GrantErrors.CredentialNotInCluster"/> (nothing changes then).</returns>
    public Result Change(AccessMode mode, Credential newCredential, GrantLabels current, string actor, DateTimeOffset now)
    {
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
            Id, UserId, current.Username, ClusterId, current.ClusterName,
            oldMode, mode, oldCredentialId, current.CredentialName, newCredential.Id, newCredential.Name.Value));
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
            Id, UserId, labels.Username, ClusterId, labels.ClusterName, CredentialId, labels.CredentialName, AccessMode));
    }

    private static void CheckMode(AccessMode mode)
    {
        if (!Enum.IsDefined(mode))
        {
            throw new ArgumentOutOfRangeException(nameof(mode), mode, "Unknown access mode.");
        }
    }
}
