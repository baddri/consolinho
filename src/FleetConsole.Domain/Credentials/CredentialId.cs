namespace FleetConsole.Domain.Credentials;

/// <summary>
/// Strongly typed identity of a <see cref="Credential"/>. Credentials are addressed by id in URLs (ADR-0013 §1) and
/// grants reference them through it; it survives token rotation (CRED-5).
/// </summary>
/// <param name="Value">The underlying GUID (version 7, so ids sort roughly by creation time and index well).</param>
public readonly record struct CredentialId(Guid Value)
{
    /// <summary>Creates a new, time-ordered (version 7) identity for a credential that is being added.</summary>
    /// <returns>A fresh <see cref="CredentialId"/>.</returns>
    public static CredentialId New() => new(Guid.CreateVersion7());
}
