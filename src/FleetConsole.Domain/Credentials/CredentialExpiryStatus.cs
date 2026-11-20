namespace FleetConsole.Domain.Credentials;

/// <summary>
/// A credential's expiry state at a point in time (CRED-4), computed by <see cref="TokenMetadata.StatusAt"/> and never
/// stored, because it changes with the clock. Severity for "worst status" displays is, from worst:
/// <see cref="Expired"/>, <see cref="ExpiringSoon"/>, <see cref="Unknown"/>, <see cref="NoExpiry"/>, <see cref="Ok"/>
/// (contract §3); that is not the declaration order.
/// </summary>
public enum CredentialExpiryStatus
{
    /// <summary>The JWT expires later than the warning window.</summary>
    Ok = 0,

    /// <summary>The JWT expires within the warning window (<c>Credentials:ExpiryWarningDays</c>).</summary>
    ExpiringSoon = 1,

    /// <summary>The JWT's expiry has passed; the cluster will reject it.</summary>
    Expired = 2,

    /// <summary>The JWT has no <c>exp</c> claim (typical for legacy secret-based SA tokens).</summary>
    NoExpiry = 3,

    /// <summary>The token is opaque, so its expiry cannot be known.</summary>
    Unknown = 4,
}
