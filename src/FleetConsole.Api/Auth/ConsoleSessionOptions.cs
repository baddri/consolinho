namespace FleetConsole.Api.Auth;

/// <summary>
/// Session settings from configuration section <see cref="SectionName"/> (ADR-0009). Validated at startup, so a bad
/// value stops the Api instead of producing odd sessions.
/// </summary>
/// <remarks>
/// <para>Prefixed (like <c>ConsoleDbContext</c>) so it never clashes with ASP.NET Core's
/// <c>Microsoft.AspNetCore.Builder.SessionOptions</c>, which the Web SDK imports implicitly.</para>
/// <para>The Application's login options (<c>AuthOptions</c>: bootstrap admins, admin groups, auto-provisioning) bind the
/// same section; each class reads only its own keys.</para>
/// </remarks>
public sealed class ConsoleSessionOptions
{
    /// <summary>Configuration section shared with the Application's login options.</summary>
    public const string SectionName = "Auth";

    /// <summary>
    /// Idle lifetime of the session cookie (<c>Auth:SessionLifetime</c>, default 8 hours). Sliding: activity in the
    /// second half of the lifetime renews it.
    /// </summary>
    public TimeSpan SessionLifetime { get; set; } = TimeSpan.FromHours(8);

    /// <summary>
    /// How often a session is checked against the database (<c>Auth:RevalidationInterval</c>, default 60 seconds,
    /// AUTH-11). Used by the session validator (T-0015). Must be shorter than <see cref="SessionLifetime"/>.
    /// </summary>
    public TimeSpan RevalidationInterval { get; set; } = TimeSpan.FromSeconds(60);
}
