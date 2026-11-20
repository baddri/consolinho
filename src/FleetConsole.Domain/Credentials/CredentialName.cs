using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Credentials;

/// <summary>
/// The name of a credential, unique within its cluster (CRED-1), e.g. <c>fleet-view</c>. Admins pick credentials by
/// name when granting access, and bulk grants can pre-select by a "preferred credential name" (GRANT-4).
/// </summary>
/// <remarks>
/// Rules: a DNS label (lowercase letters, digits and <c>-</c>, starting and ending with a letter or digit) of at most
/// <see cref="MaxLength"/> characters, like a Kubernetes ServiceAccount name. Input is not trimmed or lowercased.
/// Instances only come from <see cref="Create"/>.
/// </remarks>
public sealed record CredentialName
{
    /// <summary>Maximum length of a credential name; also the column length.</summary>
    public const int MaxLength = 63;

    private CredentialName(string value) => Value = value;

    /// <summary>The name.</summary>
    public string Value { get; }

    /// <summary>Validates <paramref name="value"/> against the credential-name rules.</summary>
    /// <param name="value">The candidate name from an add-credential request.</param>
    /// <returns>The name, or a <see cref="ErrorType.Validation"/> error (<c>Credentials.InvalidName</c>) whose message is
    /// the field message for <c>name</c>.</returns>
    public static Result<CredentialName> Create(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return CredentialErrors.InvalidName("Name is required.");
        }

        if (!DnsLabel.IsValid(value, MaxLength))
        {
            return CredentialErrors.InvalidName(
                $"Use lowercase letters, digits and '-' (max {MaxLength}), starting and ending with a letter or digit.");
        }

        return new CredentialName(value);
    }

    /// <summary>Returns the raw name, so it can be used directly in messages and logs.</summary>
    /// <returns><see cref="Value"/>.</returns>
    public override string ToString() => Value;
}
