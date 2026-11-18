using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Credentials;

/// <summary>
/// Short, non-secret identifier of a token: the first 8 lowercase hex characters of the SHA-256 of the plaintext
/// (ADR-0004). Shown to admins (CRED-3) and recorded in the audit log (old and new on rotation, CRED-5) so they can tell
/// tokens apart without ever seeing one. Computed in the Application layer, which is the only place plaintext exists.
/// </summary>
public sealed record TokenFingerprint
{
    /// <summary>Number of hex characters in a fingerprint.</summary>
    public const int Length = 8;

    private TokenFingerprint(string value) => Value = value;

    /// <summary>The fingerprint, e.g. <c>3fa9c2e1</c>.</summary>
    public string Value { get; }

    /// <summary>Validates the fingerprint format.</summary>
    /// <param name="hex8">Exactly <see cref="Length"/> lowercase hex characters.</param>
    /// <returns>The fingerprint, or a <see cref="ErrorType.Validation"/> error (<c>Credentials.InvalidFingerprint</c>).
    /// Since the Application computes the value, a failure indicates a bug there.</returns>
    public static Result<TokenFingerprint> Create(string hex8)
    {
        if (hex8 is null || hex8.Length != Length || !hex8.All(c => char.IsAsciiDigit(c) || c is >= 'a' and <= 'f'))
        {
            return Error.Validation(
                "Credentials.InvalidFingerprint",
                $"A token fingerprint must be {Length} lowercase hexadecimal characters.");
        }

        return new TokenFingerprint(hex8);
    }

    /// <summary>Returns the fingerprint text.</summary>
    /// <returns><see cref="Value"/>.</returns>
    public override string ToString() => Value;
}
