using FleetConsole.Application.Abstractions.Caching;
using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Application.Access;
using FleetConsole.Domain;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Access.Events;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Clusters.Events;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Credentials.Events;
using FleetConsole.Domain.Users;
using FleetConsole.Domain.Users.Events;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Application.Tests.Access;

/// <summary>
/// CACHE-2 by construction (ADR-0040 §5): every domain event either evicts access snapshots through
/// <see cref="AccessCacheInvalidation"/> (registered by <c>AddApplication</c>) or is listed here as not access-relevant —
/// a new event can't silently skip invalidation. Plus the event → tag mapping.
/// </summary>
public sealed class AccessCacheInvalidationTests
{
    /// <summary>Events that can't change what any user may reach, each with the reason.</summary>
    private static readonly Dictionary<Type, string> NotAccessRelevant = new()
    {
        [typeof(ClusterRegistered)] = "a new cluster has no grants yet; its first grant raises GrantCreated",
        [typeof(CredentialAdded)] = "a new credential is used by no grant yet; assigning it raises GrantCreated/GrantChanged",
        [typeof(CredentialTested)] = "records a connection test result only",
        [typeof(UserCreated)] = "a new user has no snapshot (and no grants) yet",
        [typeof(UserProvisioned)] = "first login creates the user; it has no snapshot yet",
        [typeof(UserRoleChanged)] = "the admin role is a session claim, not part of cluster access",
    };

    private static readonly UserId Alice = new(Guid.NewGuid());
    private static readonly ClusterId Cluster = new(Guid.NewGuid());
    private static readonly CredentialId Credential = new(Guid.NewGuid());

    private readonly RecordingQueryCache _cache = new();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public static TheoryData<Type> DomainEvents()
    {
        var data = new TheoryData<Type>();
        foreach (var type in DomainEventTypes())
        {
            data.Add(type);
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(DomainEvents))]
    public void Every_domain_event_is_invalidated_or_listed_as_not_access_relevant(Type eventType)
    {
        var handled = typeof(IPostCommitDomainEventHandler<>).MakeGenericType(eventType).IsAssignableFrom(typeof(AccessCacheInvalidation));

        // Exactly one of the two: a listed event that is also handled means the list is stale.
        handled.ShouldNotBe(
            NotAccessRelevant.ContainsKey(eventType),
            $"{eventType.Name}: handle it in AccessCacheInvalidation or list it in NotAccessRelevant with a reason (not both).");
    }

    [Theory]
    [MemberData(nameof(DomainEvents))]
    public async Task Handled_events_reach_AccessCacheInvalidation_through_AddApplication(Type eventType)
    {
        if (NotAccessRelevant.ContainsKey(eventType))
        {
            return;
        }

        await using var provider = ServiceProviderBuilder.Build();
        await using var scope = provider.CreateAsyncScope();

        var handlers = scope.ServiceProvider.GetServices(typeof(IPostCommitDomainEventHandler<>).MakeGenericType(eventType));

        handlers.ShouldContain(h => h is AccessCacheInvalidation);
    }

    [Fact]
    public async Task User_grant_evicts_the_user_and_group_grant_the_group()
    {
        var invalidation = new AccessCacheInvalidation(_cache);

        await invalidation.HandleAsync(Revoked(Alice, "alice", GrantSubjectKind.User), Ct);
        await invalidation.HandleAsync(Revoked(null, "sre-emea", GrantSubjectKind.Group), Ct);

        _cache.Removed.ShouldBe([[CacheTags.User(Alice)], [CacheTags.Group("sre-emea")]]);
    }

    [Fact]
    public async Task User_cluster_and_credential_events_evict_their_tags()
    {
        var invalidation = new AccessCacheInvalidation(_cache);

        await invalidation.HandleAsync(new UserGroupsChanged(Alice, "alice", ["platform"], []), Ct);
        await invalidation.HandleAsync(new ClusterDisabled(Cluster, "prod-east"), Ct);
        await invalidation.HandleAsync(new CredentialRotated(Credential, Cluster, "prod-east", "sa-viewer", "aaaa", "bbbb"), Ct);

        _cache.Removed.ShouldBe([[CacheTags.User(Alice)], [CacheTags.Cluster(Cluster)], [CacheTags.Credential(Credential)]]);
    }

    private static GrantRevoked Revoked(UserId? userId, string subject, GrantSubjectKind kind) =>
        new(new GrantId(Guid.NewGuid()), userId, subject, Cluster, "prod-east", Credential, "sa-viewer", AccessMode.ReadOnly, kind,
            kind == GrantSubjectKind.Group ? 10 : null);

    private static List<Type> DomainEventTypes() =>
        DomainAssembly.Assembly.GetTypes()
            .Where(t => t is { IsClass: true, IsAbstract: false } && typeof(IDomainEvent).IsAssignableFrom(t))
            .OrderBy(t => t.FullName, StringComparer.Ordinal)
            .ToList();

    /// <summary>Records every tag removal; never caches.</summary>
    private sealed class RecordingQueryCache : IQueryCache
    {
        public List<IReadOnlyCollection<string>> Removed { get; } = [];

        public async ValueTask<TValue> GetOrLoadAsync<TValue>(
            string key, Func<CancellationToken, Task<TValue>> load, Func<TValue, IReadOnlyCollection<string>> tagsFor, CancellationToken cancellationToken) =>
            await load(cancellationToken);

        public ValueTask RemoveByTagsAsync(IReadOnlyCollection<string> tags, CancellationToken cancellationToken)
        {
            Removed.Add(tags);
            return ValueTask.CompletedTask;
        }
    }
}
