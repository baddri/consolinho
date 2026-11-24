using FleetConsole.Domain.Access;
using FluentValidation;

namespace FleetConsole.Application.Grants;

/// <summary>Messages and rules shared by the grant validators.</summary>
internal static class GrantValidation
{
    /// <summary>The message for an access mode outside the enum (only reachable with integer values; JSON uses names).</summary>
    public const string AccessModeMessage = "Access mode must be readOnly or readWrite.";

    /// <summary>The message for a missing or out-of-range group grant priority (GRP-2); same copy as the domain error.</summary>
    public static readonly string PriorityMessage = GrantErrors.PriorityOutOfRange().Message;

    /// <summary>The message for a priority sent when changing a user grant (contract §2).</summary>
    public const string PriorityOnUserGrantMessage = "Priority applies to group grants only.";

    /// <summary>
    /// The group-name rules of <see cref="GroupName.Create"/> on a route value (GRP-3/6): the domain's message on the
    /// rule's property, so <c>system:</c> groups get their own message before the generic one.
    /// </summary>
    /// <typeparam name="T">The command type.</typeparam>
    /// <param name="rule">The rule for the group-name property.</param>
    /// <returns>The rule builder.</returns>
    public static IRuleBuilderOptionsConditions<T, string> ValidGroupName<T>(this IRuleBuilder<T, string> rule) =>
        rule.Custom((name, context) =>
        {
            var group = GroupName.Create(name);
            if (group.IsFailure)
            {
                context.AddFailure(group.Error.Message);
            }
        });
}
