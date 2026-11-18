using System.Security.Cryptography;
using System.Text;
using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Credentials;
using Microsoft.AspNetCore.DataProtection;

namespace FleetConsole.Infrastructure.Crypto;

/// <summary>
/// <see cref="ITokenProtector"/> on ASP.NET Core Data Protection (ADR-0004): authenticated encryption with the app's key
/// ring (persisted in PostgreSQL), isolated from other Data Protection uses such as the session cookie by
/// <see cref="Purpose"/>.
/// </summary>
/// <remarks>
/// Payloads carry the id of the key that encrypted them, so tokens stay readable after key rotation for as long as the
/// key is in the ring (Data Protection never deletes keys on its own). The intermediate UTF-8 plaintext buffers are
/// zeroed after use; the managed strings can't be.
/// </remarks>
internal sealed class DataProtectionTokenProtector : ITokenProtector
{
    /// <summary>
    /// The Data Protection purpose string for SA tokens. Changing it makes every stored token unreadable: bump the
    /// version only together with a re-encryption migration.
    /// </summary>
    public const string Purpose = "FleetConsole.Credentials.v1";

    private readonly IDataProtector _protector;

    /// <summary>Creates the protector for <see cref="Purpose"/>.</summary>
    /// <param name="provider">The app-wide Data Protection provider (configured by <c>AddInfrastructure</c>).</param>
    public DataProtectionTokenProtector(IDataProtectionProvider provider)
    {
        ArgumentNullException.ThrowIfNull(provider);
        _protector = provider.CreateProtector(Purpose);
    }

    /// <inheritdoc />
    public EncryptedToken Protect(SensitiveString token)
    {
        ArgumentNullException.ThrowIfNull(token);

        var plaintext = Encoding.UTF8.GetBytes(token.Reveal());
        try
        {
            return new EncryptedToken(_protector.Protect(plaintext));
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plaintext);
        }
    }

    /// <inheritdoc />
    public SensitiveString Unprotect(EncryptedToken token)
    {
        ArgumentNullException.ThrowIfNull(token);

        var plaintext = _protector.Unprotect(token.Value);
        try
        {
            return new SensitiveString(Encoding.UTF8.GetString(plaintext));
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plaintext);
        }
    }
}
