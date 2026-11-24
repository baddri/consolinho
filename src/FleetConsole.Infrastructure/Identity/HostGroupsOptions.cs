namespace FleetConsole.Infrastructure.Identity;

/// <summary>
/// How FleetConsole reads the host cluster's groups with its own host ServiceAccount (ADR-0039 §2/§5). Configuration
/// section <c>Auth:HostGroups</c>; the API server is <c>Auth:OpenShift:HostApiServerUrl</c> (<see cref="OpenShiftHostOptions"/>),
/// with the same TLS trust. Validated at startup by <see cref="HostGroupsOptionsValidator"/>.
/// </summary>
public sealed class HostGroupsOptions
{
    /// <summary>The configuration section name.</summary>
    public const string SectionName = "Auth:HostGroups";

    /// <summary>Default <see cref="TokenPath"/>: where the deployment mounts the projected host SA token (T-0258).</summary>
    public const string DefaultTokenPath = "/var/run/secrets/fleetconsole/host/token";

    /// <summary>Upper bound of <see cref="MaxSnapshotAge"/>: older group data would make host-side removals lag too long.</summary>
    public static readonly TimeSpan MaxAllowedSnapshotAge = TimeSpan.FromMinutes(5);

    /// <summary>
    /// File holding the host SA token. Re-read on every refresh, because projected tokens rotate. A missing file makes
    /// the listing <c>Unavailable</c>, not a startup error (the listing is optional for login).
    /// </summary>
    public string TokenPath { get; set; } = DefaultTokenPath;

    /// <summary>
    /// Inline token, <b>Development only</b> (the DevOAuth emulator's fake reader token; refused elsewhere at startup,
    /// like <see cref="OpenShiftHostOptions.SkipTlsVerify"/>). Wins over <see cref="TokenPath"/>; empty = not set.
    /// </summary>
    public string? Token { get; set; }

    /// <summary>
    /// The oldest snapshot ever served (default 15 s, &gt; 0, at most <see cref="MaxAllowedSnapshotAge"/>). Bounds the lag
    /// of a host-side group removal together with <c>Auth:RevalidationInterval</c>.
    /// </summary>
    public TimeSpan MaxSnapshotAge { get; set; } = TimeSpan.FromSeconds(15);
}
