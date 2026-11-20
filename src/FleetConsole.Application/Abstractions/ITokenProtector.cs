using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Abstractions;

/// <summary>
/// Port that encrypts ServiceAccount tokens before they reach the Domain and decrypts them only when a request needs
/// the plaintext (connection test, CP2 proxy), ADR-0004 / CRED-2. The Domain holds <see cref="EncryptedToken"/> only.
/// </summary>
/// <remarks>
/// Implemented in Infrastructure with ASP.NET Core Data Protection (purpose <c>FleetConsole.Credentials.v1</c>, key ring
/// in PostgreSQL). Encryption is randomized: protecting the same token twice yields different ciphertexts, so
/// ciphertexts can't be compared to detect equal tokens (use <see cref="TokenFingerprint"/>).
/// </remarks>
public interface ITokenProtector
{
    /// <summary>Encrypts a token for storage.</summary>
    /// <param name="token">The plaintext token, as received from the admin.</param>
    /// <returns>The ciphertext for <see cref="Credential.Token"/>.</returns>
    EncryptedToken Protect(SensitiveString token);

    /// <summary>
    /// Decrypts a stored token. Keep the result only for the duration of the request and reveal it only where it is sent
    /// (the outgoing <c>Authorization</c> header).
    /// </summary>
    /// <param name="token">The stored ciphertext.</param>
    /// <returns>The plaintext token, wrapped so it can't be printed by accident.</returns>
    /// <exception cref="System.Security.Cryptography.CryptographicException">When the ciphertext is corrupt or its key is
    /// no longer in the key ring (e.g. the key-encryption certificate was lost, ADR-0004). This is an infrastructure fault,
    /// not an expected result.</exception>
    SensitiveString Unprotect(EncryptedToken token);
}
