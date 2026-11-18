using System.Diagnostics;

namespace FleetConsole.Application.Abstractions;

/// <summary>
/// Wraps a secret (a ServiceAccount token, an OAuth access token) while it travels through the Application layer, so
/// it can't leak by accident: <see cref="ToString"/> returns <c>[redacted]</c>, which means a command or record that
/// contains one prints <c>[redacted]</c> from its compiler-generated <c>ToString</c> (and so in logs, exception messages
/// and the debugger) instead of the value (ADR-0013 §11, SECURITY.md "Token handling").
/// </summary>
/// <remarks>
/// <para>Only code that actually needs the plaintext — the token protector, the Kubernetes probe/proxy adapters that set
/// the <c>Authorization</c> header — calls <see cref="Reveal"/>. Grep for <c>Reveal()</c> to audit every such place.</para>
/// <para>The type has no public properties, so serializers that walk public members (System.Text.Json) write <c>{}</c>
/// rather than the secret. Equality is reference equality on purpose: comparing secrets is not a use case.</para>
/// </remarks>
[DebuggerDisplay("[redacted]")]
public sealed class SensitiveString
{
    /// <summary>The text every string conversion of a <see cref="SensitiveString"/> produces.</summary>
    public const string Redacted = "[redacted]";

    private readonly string _value;

    /// <summary>Wraps <paramref name="value"/>. Empty strings are allowed; validators decide what a valid secret is.</summary>
    /// <param name="value">The secret. Must not be <see langword="null"/>.</param>
    public SensitiveString(string value)
    {
        ArgumentNullException.ThrowIfNull(value);
        _value = value;
    }

    /// <summary>
    /// Returns the plaintext secret. Call it only at the point where the secret is actually used (encryption, an outgoing
    /// <c>Authorization</c> header) and never pass the result to a logger, exception message or response.
    /// </summary>
    /// <returns>The wrapped value.</returns>
    public string Reveal() => _value;

    /// <summary>Always <c>[redacted]</c>, so string interpolation, logging and record printing never expose the value.</summary>
    /// <returns><see cref="Redacted"/>.</returns>
    public override string ToString() => Redacted;
}
