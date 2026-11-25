using FleetConsole.Application.Abstractions.Caching;
using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Application.Access.LoadAccessSnapshot;
using FleetConsole.Domain.Access.Events;
using FleetConsole.Domain.Clusters.Events;
using FleetConsole.Domain.Credentials.Events;
using FleetConsole.Domain.Users;
using FleetConsole.Domain.Users.Events;

namespace FleetConsole.Application.Access;

/// <summary>
/// Evicts cached <see cref="AccessSnapshot"/>s after any committed change that can alter what a user may reach, so a
/// revoke, a deactivation or a disabled cluster takes effect on the very next request (CACHE-2, ADR-0040 §5).
/// </summary>
/// <remarks>
/// <para>Each event removes the tag that <see cref="LoadAccessSnapshotQuery.TagsFor"/> puts on every affected snapshot:
/// a user grant or user change → <c>user:{id}</c>; a group grant → <see cref="CacheTags.Group"/> (hashed name; every
/// member's snapshot carries the tags of all their groups, so a new grant reaches members without a row for it); a
/// cluster change → <c>cluster:{id}</c>; a rotated, tested or deleted credential → <c>credential:{id}</c>. Cascaded deletes (a
/// deleted cluster's grants and credentials) raise no events of their own and are covered by the cluster tag.</para>
/// <para>Post-commit and best effort (ADR-0040 §5): if the removal fails the entry still expires after
/// <c>Cache:Duration</c> (CACHE-4). The events that need no invalidation are listed, with a reason, in the coverage test
/// (<c>AccessCacheInvalidationCoverageTests</c>), so a new event can't silently skip this class.</para>
/// </remarks>
/// <param name="cache">The query cache.</param>
internal sealed class AccessCacheInvalidation(IQueryCache cache) :
    IPostCommitDomainEventHandler<GrantCreated>,
    IPostCommitDomainEventHandler<GrantChanged>,
    IPostCommitDomainEventHandler<GrantRevoked>,
    IPostCommitDomainEventHandler<UserDeactivated>,
    IPostCommitDomainEventHandler<UserReactivated>,
    IPostCommitDomainEventHandler<UserReadOnlyChanged>,
    IPostCommitDomainEventHandler<UserGroupsChanged>,
    IPostCommitDomainEventHandler<UserLoggedIn>,
    IPostCommitDomainEventHandler<ClusterUpdated>,
    IPostCommitDomainEventHandler<ClusterEnabled>,
    IPostCommitDomainEventHandler<ClusterDisabled>,
    IPostCommitDomainEventHandler<ClusterDeleted>,
    IPostCommitDomainEventHandler<CredentialRotated>,
    IPostCommitDomainEventHandler<CredentialTested>,
    IPostCommitDomainEventHandler<CredentialDeleted>
{
    /// <inheritdoc />
    public Task HandleAsync(GrantCreated domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        return RemoveAsync(GrantSubjectTag(domainEvent.UserId, domainEvent.SubjectName), cancellationToken);
    }

    /// <inheritdoc />
    public Task HandleAsync(GrantChanged domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        return RemoveAsync(GrantSubjectTag(domainEvent.UserId, domainEvent.SubjectName), cancellationToken);
    }

    /// <inheritdoc />
    public Task HandleAsync(GrantRevoked domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        return RemoveAsync(GrantSubjectTag(domainEvent.UserId, domainEvent.SubjectName), cancellationToken);
    }

    /// <inheritdoc />
    public Task HandleAsync(UserDeactivated domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        return RemoveAsync(CacheTags.User(domainEvent.UserId), cancellationToken);
    }

    /// <inheritdoc />
    public Task HandleAsync(UserReactivated domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        return RemoveAsync(CacheTags.User(domainEvent.UserId), cancellationToken);
    }

    /// <inheritdoc />
    public Task HandleAsync(UserReadOnlyChanged domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        return RemoveAsync(CacheTags.User(domainEvent.UserId), cancellationToken);
    }

    /// <inheritdoc />
    public Task HandleAsync(UserGroupsChanged domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        return RemoveAsync(CacheTags.User(domainEvent.UserId), cancellationToken);
    }

    /// <inheritdoc />
    /// <remarks>A login may record new groups or a new read-only flag; the next request reloads either way.</remarks>
    public Task HandleAsync(UserLoggedIn domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        return RemoveAsync(CacheTags.User(domainEvent.UserId), cancellationToken);
    }

    /// <inheritdoc />
    public Task HandleAsync(ClusterUpdated domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        return RemoveAsync(CacheTags.Cluster(domainEvent.ClusterId), cancellationToken);
    }

    /// <inheritdoc />
    public Task HandleAsync(ClusterEnabled domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        return RemoveAsync(CacheTags.Cluster(domainEvent.ClusterId), cancellationToken);
    }

    /// <inheritdoc />
    public Task HandleAsync(ClusterDisabled domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        return RemoveAsync(CacheTags.Cluster(domainEvent.ClusterId), cancellationToken);
    }

    /// <inheritdoc />
    public Task HandleAsync(ClusterDeleted domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        return RemoveAsync(CacheTags.Cluster(domainEvent.ClusterId), cancellationToken);
    }

    /// <inheritdoc />
    public Task HandleAsync(CredentialRotated domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        return RemoveAsync(CacheTags.Credential(domainEvent.CredentialId), cancellationToken);
    }

    /// <inheritdoc />
    /// <remarks>A test may save new inspect namespaces, which snapshots carry as the namespace fallback (NSA-2); every
    /// test invalidates (a rare admin action), so the event needs no "namespaces changed" flag.</remarks>
    public Task HandleAsync(CredentialTested domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        return RemoveAsync(CacheTags.Credential(domainEvent.CredentialId), cancellationToken);
    }

    /// <inheritdoc />
    public Task HandleAsync(CredentialDeleted domainEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        return RemoveAsync(CacheTags.Credential(domainEvent.CredentialId), cancellationToken);
    }

    /// <summary>A user grant names its user (<c>user:</c>); a group grant only its group (<c>group:</c>).</summary>
    private static string GrantSubjectTag(UserId? userId, string subjectName) =>
        userId is { } id ? CacheTags.User(id) : CacheTags.Group(subjectName);

    private async Task RemoveAsync(string tag, CancellationToken cancellationToken) =>
        await cache.RemoveByTagsAsync([tag], cancellationToken).ConfigureAwait(false);
}
