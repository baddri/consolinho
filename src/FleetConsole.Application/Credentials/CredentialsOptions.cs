namespace FleetConsole.Application.Credentials;

/// <summary>
/// Settings for ServiceAccount credentials, bound from the <c>Credentials</c> configuration section (contract §12) and
/// injected into handlers as <c>IOptions&lt;CredentialsOptions&gt;</c>. Registered and validated by
/// <c>AddInfrastructure</c>.
/// </summary>
public sealed class CredentialsOptions
{
    /// <summary>The configuration section name.</summary>
    public const string SectionName = "Credentials";

    /// <summary>
    /// How many days before a token's expiry it is reported as "expiring soon" (CRED-4, Q11). Default 14; must be
    /// zero or more.
    /// </summary>
    public int ExpiryWarningDays { get; set; } = 14;

    /// <summary>The total time budget of one connection test (TEST-2). Default 15 seconds; must be positive.</summary>
    public TimeSpan ConnectionTestTimeout { get; set; } = TimeSpan.FromSeconds(15);

    /// <summary><see cref="ExpiryWarningDays"/> as the window <c>TokenMetadata.StatusAt</c> takes.</summary>
    public TimeSpan ExpiryWarningWindow => TimeSpan.FromDays(ExpiryWarningDays);
}
