using FluentValidation;

namespace FleetConsole.Application.Credentials.ConnectionTesting;

/// <summary>
/// The field rule for the optional <c>inspectNamespace</c> of both test commands (contract §8.4): a DNS label of at most
/// 63 characters, because it is sent to the cluster as a namespace name.
/// </summary>
public static class InspectNamespaceRules
{
    /// <summary>The maximum length of a namespace name.</summary>
    public const int MaxLength = 63;

    /// <summary>The message for a value that is not a DNS label.</summary>
    public const string InvalidMessage =
        "The namespace must be at most 63 characters: lowercase letters, digits and '-', starting and ending with a letter or digit.";

    /// <summary>Applies the rule when a namespace is given; <see langword="null"/> means "don't inspect".</summary>
    /// <typeparam name="T">The command type.</typeparam>
    /// <param name="rule">The rule builder for the namespace property.</param>
    /// <returns>The rule builder.</returns>
    public static IRuleBuilderOptions<T, string?> ValidInspectNamespace<T>(this IRuleBuilderInitial<T, string?> rule)
    {
        ArgumentNullException.ThrowIfNull(rule);

        return rule
            .Cascade(CascadeMode.Stop)
            .MaximumLength(MaxLength).WithMessage(InvalidMessage)
            .Matches("^[a-z0-9]([-a-z0-9]*[a-z0-9])?$").WithMessage(InvalidMessage);
    }
}
