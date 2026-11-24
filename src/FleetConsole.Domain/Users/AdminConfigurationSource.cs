using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Users;

/// <summary>The kind of configuration that makes a user an administrator (ADR-0009, USR-6).</summary>
public enum AdminConfigurationSourceKind
{
    /// <summary>The user is listed in <c>Auth:BootstrapAdminUsers</c>.</summary>
    UserList,

    /// <summary>The user is in one of the <c>Auth:AdminGroups</c>; the group is in <see cref="AdminConfigurationSource.Group"/>.</summary>
    Group,
}

/// <summary>
/// Why configuration makes a user an administrator, as computed at login (ADR-0009): the bootstrap user list, or a
/// named admin group. A structured value so the API can serve it as data (POL-4) instead of text clients must parse.
/// </summary>
/// <remarks>
/// Instances only come from <see cref="UserList"/> and <see cref="ForGroup"/>, so <see cref="Group"/> is non-blank
/// exactly when <see cref="Kind"/> is <see cref="AdminConfigurationSourceKind.Group"/>. <see cref="ToString"/> is the
/// persisted and audit text; only the persistence converter reads that text back.
/// </remarks>
public sealed record AdminConfigurationSource
{
    private AdminConfigurationSource(AdminConfigurationSourceKind kind, string? group)
    {
        Kind = kind;
        Group = group;
    }

    /// <summary>The bootstrap user list source (<c>Auth:BootstrapAdminUsers</c>).</summary>
    public static AdminConfigurationSource UserList { get; } = new(AdminConfigurationSourceKind.UserList, null);

    /// <summary>Which configuration makes the user an admin.</summary>
    public AdminConfigurationSourceKind Kind { get; }

    /// <summary>The admin group name for <see cref="AdminConfigurationSourceKind.Group"/>; <see langword="null"/> otherwise.</summary>
    public string? Group { get; }

    /// <summary>Creates the source for membership in the admin group <paramref name="group"/>.</summary>
    /// <param name="group">The OpenShift group name, exactly as configured.</param>
    /// <returns>The group source.</returns>
    /// <exception cref="ArgumentException">When <paramref name="group"/> is null or blank.</exception>
    public static AdminConfigurationSource ForGroup(string group) =>
        new(AdminConfigurationSourceKind.Group, Guard.NotNullOrWhiteSpace(group));

    /// <summary>
    /// The text form: <c>"user list"</c> or <c>"group &lt;name&gt;"</c>. This is the stored column value, the audit
    /// <c>configurationSource</c> and the text in <see cref="UserErrors.AdminViaConfiguration"/>; keep it stable so old and
    /// new rows read alike.
    /// </summary>
    /// <returns>The text form.</returns>
    public override string ToString() => Kind == AdminConfigurationSourceKind.UserList ? "user list" : $"group {Group}";
}
