using System.Collections.Concurrent;
using FleetConsole.DevOAuth.Configuration;
using Microsoft.Extensions.Options;

namespace FleetConsole.DevOAuth.OAuth;

/// <summary>
/// The emulator's group membership (username → own groups), seeded from <c>DevOAuth:Users[].Groups</c> and changeable
/// at runtime with <see cref="SetGroups"/>, so tests can move a user out of a group on the "host" without restarting
/// it (e.g. the PREC-1 revalidation test, T-0255). Serves the <c>groups</c> list; <c>users/~</c> keeps reporting the
/// configured groups (like OpenShift, where the token's groups are fixed at login).
/// </summary>
/// <remarks>Singleton; reached by tests through <c>TestOAuthServer.Services</c>. Virtual groups are never stored here.</remarks>
public sealed class DevGroupMembership
{
    private readonly ConcurrentDictionary<string, IReadOnlyList<string>> _groupsByUser = new(StringComparer.Ordinal);

    /// <summary>Seeds the membership from the configured users.</summary>
    /// <param name="options">The emulator options.</param>
    internal DevGroupMembership(IOptions<DevOAuthOptions> options)
    {
        ArgumentNullException.ThrowIfNull(options);
        foreach (var user in options.Value.Users)
        {
            SetGroups(user.Name, user.Groups);
        }
    }

    /// <summary>Replaces <paramref name="username"/>'s groups (an empty list removes the user from every group).</summary>
    /// <param name="username">The OpenShift username (ordinal).</param>
    /// <param name="groups">The user's own group names; blanks and duplicates are dropped.</param>
    public void SetGroups(string username, IEnumerable<string> groups)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(username);
        ArgumentNullException.ThrowIfNull(groups);
        _groupsByUser[username] = groups.Where(g => !string.IsNullOrWhiteSpace(g)).Distinct(StringComparer.Ordinal).ToList();
    }

    /// <summary>Every group with at least one member and its sorted users, ordered by group name (ordinal).</summary>
    /// <returns>The groups as (name, users) pairs.</returns>
    public IReadOnlyList<(string Name, IReadOnlyList<string> Users)> Groups() =>
        _groupsByUser
            .SelectMany(entry => entry.Value.Select(group => (Group: group, User: entry.Key)))
            .GroupBy(pair => pair.Group, StringComparer.Ordinal)
            .OrderBy(group => group.Key, StringComparer.Ordinal)
            .Select(group => (group.Key, (IReadOnlyList<string>)group.Select(pair => pair.User).Order(StringComparer.Ordinal).ToList()))
            .ToList();
}
