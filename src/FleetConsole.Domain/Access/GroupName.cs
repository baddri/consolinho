using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Access;

/// <summary>
/// The name of a host OpenShift <c>Group</c> used as a grant subject (ADR-0034 §1, GRP-2/3). Not a reference to a
/// FleetConsole table: groups live on the host cluster, and a grant may name a group that doesn't exist (yet).
/// </summary>
/// <remarks>
/// Rules: input is trimmed; <c>system:*</c> groups (any case) are refused first with their own error, because a
/// virtual group such as <c>system:authenticated</c> would grant everyone (ADR-0034 §3). Otherwise the name must be a
/// valid Kubernetes path segment of at most <see cref="MaxLength"/> characters: not empty, not <c>.</c>/<c>..</c>, no
/// <c>/</c>, <c>%</c>, <c>:</c> or control characters. Equality is ordinal because OpenShift group names are
/// case-sensitive. Instances only come from <see cref="Create"/>.
/// </remarks>
public sealed record GroupName
{
    /// <summary>Maximum length of a group name (a Kubernetes object name); also the column length.</summary>
    public const int MaxLength = 253;

    private const string SystemPrefix = "system:";

    private GroupName(string value) => Value = value;

    /// <summary>The group name as stored, e.g. <c>sre-emea</c>.</summary>
    public string Value { get; }

    /// <summary>Validates <paramref name="value"/> against the group-name rules.</summary>
    /// <param name="value">The candidate name from a request (or a stored value being re-read).</param>
    /// <returns>The trimmed name, or, checked in this order, <see cref="GrantErrors.SystemGroup"/> and
    /// <see cref="GrantErrors.InvalidGroupName"/>.</returns>
    public static Result<GroupName> Create(string? value)
    {
        var trimmed = value?.Trim() ?? string.Empty;

        if (trimmed.StartsWith(SystemPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return GrantErrors.SystemGroup();
        }

        if (trimmed.Length is 0 or > MaxLength
            || trimmed is "." or ".."
            || trimmed.Any(c => c is '/' or '%' or ':' || char.IsControl(c)))
        {
            return GrantErrors.InvalidGroupName();
        }

        return new GroupName(trimmed);
    }

    /// <summary>Returns the raw name, so it can be used directly in messages and logs.</summary>
    /// <returns><see cref="Value"/>.</returns>
    public override string ToString() => Value;

    /// <summary>
    /// Returns the raw name. Exists for queries: EF Core translates this cast on the converted <c>group_name</c>
    /// column to SQL (so <c>user.Groups.Contains((string)grant.GroupName)</c> becomes <c>= ANY(groups)</c>), and the
    /// same expression still runs in memory — unlike <see cref="Value"/>, which EF can't translate.
    /// </summary>
    /// <param name="name">The group name.</param>
    public static explicit operator string(GroupName name)
    {
        ArgumentNullException.ThrowIfNull(name);
        return name.Value;
    }
}
