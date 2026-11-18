namespace FleetConsole.Domain.Credentials;

/// <summary>What kind of token a credential holds, as detected when it was added or rotated (CRED-3).</summary>
public enum TokenType
{
    /// <summary>A JWT (projected or legacy secret-based SA token); subject and expiry are read from its claims for display.</summary>
    Jwt = 0,

    /// <summary>Anything that is not a JWT; accepted (Q10), but its identity and expiry are unknown, so the UI warns.</summary>
    Opaque = 1,
}
