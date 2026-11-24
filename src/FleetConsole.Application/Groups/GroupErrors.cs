using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Groups;

/// <summary>
/// Expected failures of the Groups admin queries (contract CP4.5a §4). Application-level, not domain: host groups are
/// not a FleetConsole aggregate, so "not found" is a statement about the host listing and the grants combined.
/// </summary>
public static class GroupErrors
{
    /// <summary>
    /// 404 <c>Groups.NotFound</c>: the name isn't a valid group name, or the host listing is readable, the group isn't on
    /// it and no grant names it. The message never echoes the requested name (it is caller input, possibly invalid).
    /// </summary>
    /// <returns>The error.</returns>
    public static Error NotFound() => Error.NotFound("Groups.NotFound", "Group was not found.");
}
