namespace FleetConsole.Application.Auth;

/// <summary>
/// Computes the user's admin configuration source at login (ADR-0009, AUTH-8): the text stored in
/// <c>User.AdminConfigurationSource</c> and shown as "Admin via configuration (…)" (USR-6).
/// </summary>
public static class AdminConfigurationResolver
{
    /// <summary>Source text for a user listed in <see cref="AuthOptions.BootstrapAdminUsers"/>.</summary>
    public const string UserListSource = "user list";

    /// <summary>
    /// Resolves why configuration makes <paramref name="username"/> an admin. The bootstrap user list wins over groups;
    /// among groups, the first <see cref="AuthOptions.AdminGroups"/> entry (configuration order) the user is in wins.
    /// All matches are exact and case-sensitive; virtual <c>system:*</c> groups never match.
    /// </summary>
    /// <param name="username">The OpenShift username.</param>
    /// <param name="groups">The user's OpenShift groups at this login.</param>
    /// <param name="options">The login options.</param>
    /// <returns><c>"user list"</c>, <c>"group &lt;name&gt;"</c>, or <see langword="null"/> when configuration doesn't
    /// make the user an admin.</returns>
    public static string? Resolve(string username, IReadOnlyList<string> groups, AuthOptions options)
    {
        ArgumentNullException.ThrowIfNull(username);
        ArgumentNullException.ThrowIfNull(groups);
        ArgumentNullException.ThrowIfNull(options);

        if (options.BootstrapAdminUsers.Contains(username, StringComparer.Ordinal))
        {
            return UserListSource;
        }

        var adminGroup = options.AdminGroups.FirstOrDefault(adminGroup =>
            !OpenShiftGroups.IsVirtual(adminGroup) && groups.Contains(adminGroup, StringComparer.Ordinal));
        return adminGroup is null ? null : $"group {adminGroup}";
    }
}
