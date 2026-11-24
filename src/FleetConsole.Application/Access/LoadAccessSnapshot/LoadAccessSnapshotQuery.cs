using FleetConsole.Application.Abstractions.Caching;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Access.LoadAccessSnapshot;

/// <summary>
/// Loads everything that decides what <paramref name="UserId"/> can reach — the user's flags and groups and every
/// candidate grant with its cluster and credential — as one cached <see cref="AccessSnapshot"/> (ADR-0040 §4, CACHE-1).
/// </summary>
/// <remarks>
/// <para>Only <see cref="ClusterAccessReader"/> sends it, so it carries no authorization marker; the reader resolves
/// the snapshot per request (enabled filter, named cluster, session read-only, precedence).</para>
/// <para>Invalidation: <see cref="AccessCacheInvalidation"/> removes the tags from <see cref="TagsFor"/> after the
/// commit of any access-relevant change; <c>Cache:Duration</c> is the backstop (CACHE-4).</para>
/// </remarks>
/// <param name="UserId">The user whose access is loaded.</param>
internal sealed record LoadAccessSnapshotQuery(UserId UserId) : ICacheableQuery<AccessSnapshot>
{
    /// <summary>
    /// <c>access:v1:user:{id}</c>. Bump <c>v1</c> on any change to the shape of <see cref="AccessSnapshot"/>, so a
    /// shared (Redis) cache never hands an old shape to new code during a rolling deployment.
    /// </summary>
    public string CacheKey => $"access:v1:user:{UserId.Value:D}";

    /// <summary>
    /// <c>user:{id}</c>, plus <c>cluster:</c> and <c>credential:</c> of every row and <c>group:</c> of every group the
    /// user is in — so a new grant for one of those groups reaches a member whose snapshot has no row for it yet.
    /// </summary>
    /// <param name="value">The loaded snapshot.</param>
    /// <returns>The distinct tags.</returns>
    public IReadOnlyCollection<string> TagsFor(AccessSnapshot value)
    {
        ArgumentNullException.ThrowIfNull(value);

        var tags = new HashSet<string>(StringComparer.Ordinal) { CacheTags.User(UserId) };
        foreach (var row in value.Rows)
        {
            tags.Add(CacheTags.Cluster(new ClusterId(row.ClusterId)));
            tags.Add(CacheTags.Credential(new CredentialId(row.CredentialId)));
        }

        foreach (var group in value.UserGroups)
        {
            // CacheTags.Group rejects blanks; stored groups are never blank, but a tag is not worth an exception.
            if (!string.IsNullOrWhiteSpace(group))
            {
                tags.Add(CacheTags.Group(group));
            }
        }

        return tags;
    }
}
