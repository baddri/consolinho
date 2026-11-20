using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Users;

/// <summary>
/// An OpenShift user name, the natural key of a FleetConsole <see cref="User"/> (USR-2). It is matched exactly and
/// case-sensitively against the <c>metadata.name</c> of the OCP <c>User</c> returned at login, so the rules mirror the
/// OpenShift user-name rules (contract §7.2).
/// </summary>
/// <remarks>
/// Rules: 1–<see cref="MaxLength"/> characters; no <c>/</c>, <c>%</c>, whitespace or control characters; not
/// <c>.</c>, <c>..</c> or <c>~</c>. Instances only come from <see cref="Create"/>, so holding a <see cref="Username"/>
/// means the value is valid. Equality is ordinal (case-sensitive) value equality.
/// </remarks>
public sealed record Username
{
    /// <summary>Maximum length of a username (the Kubernetes object-name limit); also the column length.</summary>
    public const int MaxLength = 253;

    private Username(string value) => Value = value;

    /// <summary>The username exactly as OpenShift reports it.</summary>
    public string Value { get; }

    /// <summary>
    /// Validates <paramref name="value"/> against the OpenShift user-name rules. Input is not trimmed or normalized:
    /// a username that differs only in case or surrounding spaces is a different (or invalid) name.
    /// </summary>
    /// <param name="value">The candidate username, e.g. from a create-user request or the OAuth callback.</param>
    /// <returns>The username, or a <see cref="ErrorType.Validation"/> error (<c>Users.InvalidUsername</c>) whose
    /// message says which rule was broken.</returns>
    public static Result<Username> Create(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return UserErrors.InvalidUsername("Username is required.");
        }

        if (value.Length > MaxLength)
        {
            return UserErrors.InvalidUsername($"Username must be at most {MaxLength} characters long.");
        }

        if (value is "." or ".." or "~")
        {
            return UserErrors.InvalidUsername("Username can't be '.', '..' or '~'.");
        }

        // Whitespace is checked before control characters because some characters (tab, newline) are both, and the
        // whitespace message is the one users recognise.
        if (value.Any(c => c is '/' or '%' || char.IsWhiteSpace(c)))
        {
            return UserErrors.InvalidUsername("Username can't contain '/', '%' or whitespace.");
        }

        if (value.Any(char.IsControl))
        {
            return UserErrors.InvalidUsername("Username can't contain control characters.");
        }

        return new Username(value);
    }

    /// <summary>Returns the raw username, so it can be used directly in messages and logs.</summary>
    /// <returns><see cref="Value"/>.</returns>
    public override string ToString() => Value;
}
