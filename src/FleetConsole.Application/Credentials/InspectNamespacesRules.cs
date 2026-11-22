using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FluentValidation;

namespace FleetConsole.Application.Credentials;

/// <summary>
/// The FluentValidation rule for an optional <c>inspectNamespaces</c> list (NST-2), shared by the add-credential and
/// connection-test validators. The rule itself lives in <see cref="InspectNamespaces.Create"/>; its field errors
/// (<c>inspectNamespaces</c>, <c>inspectNamespaces[i]</c>) are copied unchanged, so the Domain stays the single source.
/// </summary>
public static class InspectNamespacesRules
{
    /// <summary>Validates the list with <see cref="InspectNamespaces.Create"/>; <see langword="null"/> means none and passes.</summary>
    /// <typeparam name="T">The command type.</typeparam>
    /// <param name="rule">The rule builder for the list property.</param>
    /// <returns>The rule builder.</returns>
    public static IRuleBuilderOptionsConditions<T, IReadOnlyList<string>?> ValidInspectNamespaces<T>(
        this IRuleBuilderInitial<T, IReadOnlyList<string>?> rule)
    {
        ArgumentNullException.ThrowIfNull(rule);

        return rule.Custom((values, context) =>
        {
            var result = InspectNamespaces.Create(values);
            if (result.IsSuccess)
            {
                return;
            }

            if (result.Error is not ValidationError fieldErrors)
            {
                throw new InvalidOperationException($"InspectNamespaces.Create returned a non-field error '{result.Error.Code}'.");
            }

            foreach (var (field, messages) in fieldErrors.Errors)
            {
                foreach (var message in messages)
                {
                    context.AddFailure(field, message);
                }
            }
        });
    }
}
