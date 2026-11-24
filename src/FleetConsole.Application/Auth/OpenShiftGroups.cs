namespace FleetConsole.Application.Auth;

/// <summary>
/// Rules for OpenShift group names reported by <c>users/~</c>. A real cluster adds virtual groups every user is in
/// (<c>system:authenticated</c>, <c>system:authenticated:oauth</c>); they carry no information about the person and
/// would make an admin-group match on them grant everyone admin.
/// </summary>
/// <remarks>
/// Decision (orchestrator ruling, T-0014): virtual groups are dropped <b>once, at login, before storing</b>
/// (<see cref="WithoutVirtualGroups"/>), so the stored user groups, <c>/api/auth/me</c>, the admin UI and the
/// <c>auth.login</c> audit details never show them, and no later feature has to remember to filter.
/// <see cref="AdminConfigurationResolver"/> also ignores them on its own, as defence in depth.
/// </remarks>
public static class OpenShiftGroups
{
    /// <summary>Prefix of OpenShift/Kubernetes virtual groups.</summary>
    public const string VirtualGroupPrefix = "system:";

    /// <summary>
    /// Whether <paramref name="group"/> is a virtual <c>system:*</c> group. The prefix match ignores case
    /// (<see cref="StringComparison.OrdinalIgnoreCase"/>) so it agrees with <c>GroupName</c> and the access resolver,
    /// which reject/ignore <c>system:</c> in any case (GRP-3); otherwise a host group such as <c>System:Ops</c> would be
    /// stored and shown although it can never grant anything (T-0272).
    /// </summary>
    /// <param name="group">A group name.</param>
    /// <returns><see langword="true"/> for virtual groups.</returns>
    public static bool IsVirtual(string group)
    {
        ArgumentNullException.ThrowIfNull(group);
        return group.StartsWith(VirtualGroupPrefix, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// The groups to store and show: virtual and blank names removed, duplicates removed, order of first occurrence kept.
    /// </summary>
    /// <param name="groups">The groups as reported by OpenShift.</param>
    /// <returns>The filtered list.</returns>
    public static IReadOnlyList<string> WithoutVirtualGroups(IEnumerable<string> groups)
    {
        ArgumentNullException.ThrowIfNull(groups);
        return groups
            .Where(group => !string.IsNullOrWhiteSpace(group) && !IsVirtual(group))
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }
}
