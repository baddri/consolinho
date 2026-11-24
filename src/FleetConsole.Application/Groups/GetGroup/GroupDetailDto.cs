using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Groups.GetGroup;

// Returned by GET /api/admin/groups/{groupName}. Published in the OpenAPI document as the "GroupDetail" and
// "GroupMember" schemas; the XML docs below are written for API consumers.

/// <summary>A group as shown on the Group detail page.</summary>
/// <param name="Name">The OpenShift group name (case-sensitive).</param>
/// <param name="HostStatus">Whether the host cluster's groups could be read: ok, forbidden or unavailable.</param>
/// <param name="HostReadAt">When the host groups were read; null unless hostStatus is ok.</param>
/// <param name="FoundOnHost">Whether the group exists on the host cluster; null when hostStatus isn't ok.</param>
/// <param name="ClusterCount">Number of clusters the group is granted access to.</param>
/// <param name="Members">The host group's users in name order; null when unknown (host not readable, or group not on the host).</param>
public sealed record GroupDetailDto(
    string Name,
    HostGroupsStatus HostStatus,
    DateTimeOffset? HostReadAt,
    bool? FoundOnHost,
    int ClusterCount,
    IReadOnlyList<GroupMemberDto>? Members);

/// <summary>A user listed as a member of the host group.</summary>
/// <param name="Username">The OpenShift username.</param>
/// <param name="IsRegistered">Whether a FleetConsole user with this username exists (link to its user page).</param>
/// <param name="DisplayName">The FleetConsole user's display name; null when not registered or not known.</param>
/// <param name="Status">The FleetConsole user's status; null when not registered.</param>
public sealed record GroupMemberDto(string Username, bool IsRegistered, string? DisplayName, UserStatus? Status);
