using System.Globalization;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Abstractions.Caching;

/// <summary>
/// Builds cache tag strings — the one place their format lives, so the query that sets a tag and the event handler
/// that removes it can never disagree (ADR-0040 §4; event → tag table in BACKEND.md §Recipes).
/// </summary>
public static class CacheTags
{
    /// <summary>Tag of entries that depend on the user (e.g. its grants or read-only flag): <c>user:{id}</c>.</summary>
    /// <param name="id">The user id.</param>
    /// <returns>The tag.</returns>
    public static string User(UserId id) => "user:" + Format(id.Value);

    /// <summary>Tag of entries that depend on the cluster (e.g. its URL or enabled flag): <c>cluster:{id}</c>.</summary>
    /// <param name="id">The cluster id.</param>
    /// <returns>The tag.</returns>
    public static string Cluster(ClusterId id) => "cluster:" + Format(id.Value);

    /// <summary>Tag of entries that depend on the credential (e.g. its token or expiry): <c>credential:{id}</c>.</summary>
    /// <param name="id">The credential id.</param>
    /// <returns>The tag.</returns>
    public static string Credential(CredentialId id) => "credential:" + Format(id.Value);

    /// <summary>Tag of entries that depend on an OpenShift group (e.g. a group grant): <c>group:{name}</c>.</summary>
    /// <param name="name">The group name as recorded (case-sensitive, like OpenShift group names).</param>
    /// <returns>The tag.</returns>
    public static string Group(string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        return "group:" + name;
    }

    // "D" (lower-case, hyphenated) is Guid.ToString()'s default; spelled out so the format can't drift.
    private static string Format(Guid id) => id.ToString("D", CultureInfo.InvariantCulture);
}
