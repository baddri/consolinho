using FleetConsole.Application.Abstractions.Kubernetes;

namespace FleetConsole.Application.Groups.ListGroups;

// Returned by GET /api/admin/groups. Published in the OpenAPI document as the "GroupList" and "GroupRow" schemas; the
// XML docs below are written for API consumers.

/// <summary>The Groups list: host groups and groups named in grants, with what is known about the host listing.</summary>
/// <param name="HostStatus">Whether the host cluster's groups could be read: ok, forbidden (FleetConsole's host service account may not list groups) or unavailable.</param>
/// <param name="HostReadAt">When the host groups were read (at most 15 seconds ago); null unless hostStatus is ok.</param>
/// <param name="Items">The groups, sorted by name; system groups are never listed.</param>
public sealed record GroupListDto(HostGroupsStatus HostStatus, DateTimeOffset? HostReadAt, IReadOnlyList<GroupRowDto> Items);

/// <summary>One group in the Groups list.</summary>
/// <param name="Name">The OpenShift group name (case-sensitive).</param>
/// <param name="FoundOnHost">Whether the group exists on the host cluster; false for a group known only from grants; null when hostStatus isn't ok.</param>
/// <param name="MemberCount">Number of users in the host group; null when unknown (host not readable, or group not on the host).</param>
/// <param name="ClusterCount">Number of clusters the group is granted access to.</param>
public sealed record GroupRowDto(string Name, bool? FoundOnHost, int? MemberCount, int ClusterCount);
