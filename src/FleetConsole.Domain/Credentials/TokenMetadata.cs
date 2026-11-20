namespace FleetConsole.Domain.Credentials;

/// <summary>
/// Display metadata of a credential's token (CRED-3), read by the Application layer from the JWT claims
/// <em>without</em> signature validation when the token is added or rotated. Purely informational: the cluster, not
/// FleetConsole, decides whether a token is valid.
/// </summary>
/// <remarks>For <see cref="TokenType.Opaque"/> tokens all claims are <see langword="null"/>; use <see cref="Opaque"/>.</remarks>
/// <param name="Type">JWT or opaque.</param>
/// <param name="Subject">The raw JWT <c>sub</c> claim, e.g. <c>system:serviceaccount:fleet:viewer</c>.</param>
/// <param name="IssuedAt">The JWT <c>iat</c> claim.</param>
/// <param name="ExpiresAt">The JWT <c>exp</c> claim; <see langword="null"/> when absent (no expiry) or unknown (opaque).</param>
public sealed record TokenMetadata(TokenType Type, string? Subject, DateTimeOffset? IssuedAt, DateTimeOffset? ExpiresAt)
{
    private const string ServiceAccountPrefix = "system:serviceaccount:";

    /// <summary>Metadata of an opaque (non-JWT) token: nothing is known about it.</summary>
    public static TokenMetadata Opaque { get; } = new(TokenType.Opaque, null, null, null);

    /// <summary>
    /// The ServiceAccount the token belongs to as <c>&lt;namespace&gt;/&lt;name&gt;</c>, when <see cref="Subject"/> has the
    /// form <c>system:serviceaccount:&lt;namespace&gt;:&lt;name&gt;</c> with both parts non-empty; otherwise
    /// <see langword="null"/> (e.g. a user token or an opaque token).
    /// </summary>
    public string? ServiceAccount
    {
        get
        {
            if (Subject is null || !Subject.StartsWith(ServiceAccountPrefix, StringComparison.Ordinal))
            {
                return null;
            }

            // Namespace and name are DNS labels/subdomains, so neither contains ':'; anything else is not an SA subject.
            var parts = Subject[ServiceAccountPrefix.Length..].Split(':');
            return parts is [{ Length: > 0 } ns, { Length: > 0 } name] ? $"{ns}/{name}" : null;
        }
    }

    /// <summary>
    /// The expiry status at <paramref name="now"/> (CRED-4): <see cref="CredentialExpiryStatus.Unknown"/> for opaque
    /// tokens, <see cref="CredentialExpiryStatus.NoExpiry"/> for a JWT without <c>exp</c>,
    /// <see cref="CredentialExpiryStatus.Expired"/> when <c>exp</c> is at or before <paramref name="now"/> (RFC 7519: the
    /// token must not be accepted on or after <c>exp</c>), <see cref="CredentialExpiryStatus.ExpiringSoon"/> when it is
    /// within <paramref name="warningWindow"/> (inclusive), otherwise <see cref="CredentialExpiryStatus.Ok"/>.
    /// </summary>
    /// <param name="now">Current time (from <c>IClock</c>).</param>
    /// <param name="warningWindow">The "expiring soon" window (<c>Credentials:ExpiryWarningDays</c>); not negative.</param>
    /// <returns>The status.</returns>
    public CredentialExpiryStatus StatusAt(DateTimeOffset now, TimeSpan warningWindow)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(warningWindow, TimeSpan.Zero);

        if (Type == TokenType.Opaque)
        {
            return CredentialExpiryStatus.Unknown;
        }

        if (ExpiresAt is not { } expiresAt)
        {
            return CredentialExpiryStatus.NoExpiry;
        }

        if (expiresAt <= now)
        {
            return CredentialExpiryStatus.Expired;
        }

        return expiresAt - now <= warningWindow ? CredentialExpiryStatus.ExpiringSoon : CredentialExpiryStatus.Ok;
    }
}
