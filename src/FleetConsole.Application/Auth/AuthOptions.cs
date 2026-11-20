namespace FleetConsole.Application.Auth;

/// <summary>
/// Login settings from the <c>Auth</c> configuration section (contract §12): whether unknown OpenShift users are
/// provisioned at their first login (AUTH-5/6) and which users and groups are administrators by configuration
/// (AUTH-8, ADR-0009). Injected into the login use case as <c>IOptions&lt;AuthOptions&gt;</c>; bound and validated by
/// <c>AddInfrastructure</c>.
/// </summary>
/// <remarks>
/// The Api's session settings (<c>ConsoleSessionOptions</c>: lifetime, revalidation interval) bind the same section;
/// each class reads only its own keys. Configuration admins are evaluated <b>at login only</b>: changing these lists
/// takes effect at each user's next login.
/// </remarks>
public sealed class AuthOptions
{
    /// <summary>The configuration section name.</summary>
    public const string SectionName = "Auth";

    /// <summary>
    /// Whether an OpenShift user unknown to FleetConsole is created at their first login (<c>Auth:AutoProvision</c>,
    /// default <see langword="true"/>, Q1). When <see langword="false"/> only users an admin pre-created may log in.
    /// </summary>
    public bool AutoProvision { get; set; } = true;

    /// <summary>
    /// Usernames that are administrators by configuration (<c>Auth:BootstrapAdminUsers</c>), matched exactly
    /// (ordinal). The recovery path when no writable admin is left (ADR-0009).
    /// </summary>
    public IList<string> BootstrapAdminUsers { get; } = [];

    /// <summary>
    /// OpenShift groups whose members are administrators by configuration (<c>Auth:AdminGroups</c>), matched exactly
    /// (ordinal) in this order; the first match is shown as the source (<c>"group &lt;name&gt;"</c>). Virtual
    /// <c>system:*</c> groups are refused by validation: every OAuth user is in <c>system:authenticated</c>.
    /// </summary>
    public IList<string> AdminGroups { get; } = [];
}
