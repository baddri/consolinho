using FleetConsole.Application.Abstractions;
using FluentValidation;

namespace FleetConsole.Application.Credentials.Tokens;

/// <summary>
/// The validation rules for a ServiceAccount token in a request (contract §8.4, CRED-1), shared by every use case that
/// accepts one (add, rotate, and the unsaved-token test of T-0020) so they can't drift apart.
/// </summary>
/// <remarks>
/// <para>The Api trims the token before wrapping it in <see cref="SensitiveString"/>, so these rules see the trimmed
/// value: required, no whitespace anywhere, at most <see cref="MaxLength"/> characters, printable ASCII only.</para>
/// <para><b>Messages never echo the token</b> (CRED-2): they are fixed texts, and the rules don't use FluentValidation's
/// <c>{PropertyValue}</c> placeholder. The failure's attempted value is the <see cref="SensitiveString"/> itself, whose
/// <c>ToString()</c> is redacted, and <c>ValidationBehavior</c> only forwards messages anyway.</para>
/// <para>The printable-ASCII rule goes beyond the contract text: a bearer token is sent in an HTTP header, which can't
/// carry other characters, so such a token could never work and would only fail later inside a connection test.</para>
/// </remarks>
public static class TokenValidationRules
{
    /// <summary>Maximum length of a token, in characters (16 KiB; real SA tokens are around 1–2 KiB).</summary>
    public const int MaxLength = 16384;

    /// <summary>Message when the token is missing or blank.</summary>
    public const string RequiredMessage = "Token is required.";

    /// <summary>Message when the token contains whitespace (often a copy/paste accident with wrapped lines).</summary>
    public const string WhitespaceMessage = "The token must not contain spaces or line breaks.";

    /// <summary>Message when the token is longer than <see cref="MaxLength"/>.</summary>
    public static readonly string TooLongMessage = $"The token must be at most {MaxLength} characters long.";

    /// <summary>Message when the token contains characters an HTTP header can't carry.</summary>
    public const string InvalidCharactersMessage = "The token must contain only printable ASCII characters.";

    /// <summary>
    /// Applies the token rules to a <see cref="SensitiveString"/> property. Stops at the first broken rule, so a user
    /// sees one actionable message per field.
    /// </summary>
    /// <typeparam name="T">The request type.</typeparam>
    /// <param name="rule">The rule builder of the token property, e.g. <c>RuleFor(c =&gt; c.Token)</c>.</param>
    /// <returns>The rule builder, for chaining.</returns>
    public static IRuleBuilderOptions<T, SensitiveString> ValidToken<T>(this IRuleBuilderInitial<T, SensitiveString> rule)
    {
        ArgumentNullException.ThrowIfNull(rule);

        return rule
            .Cascade(CascadeMode.Stop)
            .Must(token => token is not null && token.Reveal().Length > 0).WithMessage(RequiredMessage)
            .Must(token => !token.Reveal().Any(char.IsWhiteSpace)).WithMessage(WhitespaceMessage)
            .Must(token => token.Reveal().Length <= MaxLength).WithMessage(TooLongMessage)
            .Must(token => token.Reveal().All(c => c is >= '!' and <= '~')).WithMessage(InvalidCharactersMessage);
    }
}
