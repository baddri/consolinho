using System.Diagnostics.CodeAnalysis;

namespace FleetConsole.Domain.Credentials;

/// <summary>
/// A ServiceAccount token as ciphertext (ADR-0004). The Domain only stores and replaces it: encryption and decryption
/// happen in the Application layer through the <c>ITokenProtector</c> port, so plaintext tokens never enter the Domain.
/// </summary>
/// <remarks>
/// <para><see cref="ToString"/> is redacted so the ciphertext never ends up in logs or exception messages either; it is
/// not secret on its own, but there is no reason to spread it.</para>
/// <para>Equality compares the bytes. The constructor copies its input so the caller's array cannot change the stored
/// value; treat <see cref="Value"/> as read-only.</para>
/// </remarks>
public sealed record EncryptedToken
{
    /// <summary>Wraps protected token bytes.</summary>
    /// <param name="value">The ciphertext produced by <c>ITokenProtector</c>; must not be empty.</param>
    /// <exception cref="ArgumentException">When <paramref name="value"/> is empty.</exception>
    public EncryptedToken(byte[] value)
    {
        ArgumentNullException.ThrowIfNull(value);
        if (value.Length == 0)
        {
            throw new ArgumentException("An encrypted token cannot be empty.", nameof(value));
        }

        Value = [.. value];
    }

    /// <summary>The ciphertext, as persisted in the <c>token</c> column. Do not modify the array.</summary>
    [SuppressMessage("Performance", "CA1819:Properties should not return arrays",
        Justification = "Opaque byte payload handed to ITokenProtector and the bytea column; a copy per read buys nothing.")]
    public byte[] Value { get; }

    /// <summary>Byte-wise equality.</summary>
    /// <param name="other">The token to compare with.</param>
    /// <returns><see langword="true"/> when both hold the same bytes.</returns>
    public bool Equals(EncryptedToken? other) => other is not null && Value.AsSpan().SequenceEqual(other.Value);

    /// <inheritdoc />
    public override int GetHashCode()
    {
        var hash = new HashCode();
        hash.AddBytes(Value);
        return hash.ToHashCode();
    }

    /// <summary>Never prints the bytes.</summary>
    /// <returns><c>[redacted]</c>.</returns>
    public override string ToString() => "[redacted]";
}
