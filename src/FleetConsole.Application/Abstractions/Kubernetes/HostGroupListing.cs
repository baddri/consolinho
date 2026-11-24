namespace FleetConsole.Application.Abstractions.Kubernetes;

/// <summary>
/// Outcome of reading the host's groups (contract §1 <c>HostGroupsStatus</c>, written camelCase on the wire). The UI
/// shows the GPG-4 hint / UIG-2 alert for anything but <see cref="Ok"/>; revalidation fails closed on it (ADR-0039 §3).
/// </summary>
public enum HostGroupsStatus
{
    /// <summary>The listing was read; <see cref="HostGroupListing.Groups"/> is the host's state at <see cref="HostGroupListing.ReadAt"/>.</summary>
    Ok,

    /// <summary>The host answered 401/403: FleetConsole's host SA lacks <c>get</c>/<c>list</c> on <c>groups</c> (or its token is bad).</summary>
    Forbidden,

    /// <summary>Host unreachable, timeout, 5xx, unusable answer, token missing, or listing not configured.</summary>
    Unavailable,
}

/// <summary>A host group and its members, as listed by the host API server.</summary>
/// <param name="Name">The group name (<c>metadata.name</c>); never a virtual <c>system:*</c> group.</param>
/// <param name="Users">The member usernames (<c>users</c>; empty when the host sends none), de-duplicated (ordinal).</param>
public sealed record HostGroup(string Name, IReadOnlyList<string> Users);

/// <summary>One answer of <see cref="IHostGroupDirectory"/>: the status, when the data was read, and the groups.</summary>
/// <param name="Status">Whether the listing could be read.</param>
/// <param name="ReadAt">When the data was read from the host (start of the read, so its age is never understated);
/// <see langword="null"/> unless <see cref="HostGroupsStatus.Ok"/>.</param>
/// <param name="Groups">The groups sorted by name (ordinal), <c>system:*</c> removed by the adapter; empty unless
/// <see cref="HostGroupsStatus.Ok"/>.</param>
public sealed record HostGroupListing(HostGroupsStatus Status, DateTimeOffset? ReadAt, IReadOnlyList<HostGroup> Groups)
{
    /// <summary>A failed read: <paramref name="status"/>, no time, no groups.</summary>
    /// <param name="status"><see cref="HostGroupsStatus.Forbidden"/> or <see cref="HostGroupsStatus.Unavailable"/>.</param>
    /// <returns>The listing.</returns>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="status"/> is <see cref="HostGroupsStatus.Ok"/>.</exception>
    public static HostGroupListing Failed(HostGroupsStatus status) =>
        status == HostGroupsStatus.Ok
            ? throw new ArgumentOutOfRangeException(nameof(status), status, "A failed listing can't be Ok.")
            : new HostGroupListing(status, null, []);

    /// <summary>
    /// The groups whose members include <paramref name="username"/> (ordinal match: OpenShift usernames are
    /// case-sensitive), sorted ordinal. Empty for a listing that isn't <see cref="HostGroupsStatus.Ok"/>, so callers must
    /// check <see cref="Status"/> first: "in no group" and "unknown" mean different things to revalidation.
    /// </summary>
    /// <param name="username">The OpenShift username.</param>
    /// <returns>The group names.</returns>
    public IReadOnlyList<string> GroupsOf(string username)
    {
        ArgumentNullException.ThrowIfNull(username);
        return Groups
            .Where(group => group.Users.Contains(username, StringComparer.Ordinal))
            .Select(group => group.Name)
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .ToList();
    }
}
