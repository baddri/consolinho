using FleetConsole.Application.Grants.BulkGrant;
using FleetConsole.Domain.Access;
using FluentValidation;

namespace FleetConsole.Application.Grants.BulkGroupGrant;

/// <summary>
/// Shape rules of <see cref="BulkGroupGrantCommand"/>: group name and priority as for a single group grant, and the
/// item rules of the user bulk grant (1 to 100 items, each with a cluster name, no cluster twice) with the same
/// messages. Item problems that need the database are the handler's field errors.
/// </summary>
internal sealed class BulkGroupGrantValidator : AbstractValidator<BulkGroupGrantCommand>
{
    /// <summary>Defines the rules.</summary>
    public BulkGroupGrantValidator()
    {
        RuleFor(c => c.GroupName).ValidGroupName();
        RuleFor(c => c.AccessMode).IsInEnum().WithMessage(GrantValidation.AccessModeMessage);
        RuleFor(c => c.Priority).InclusiveBetween(Grant.MinPriority, Grant.MaxPriority).WithMessage(GrantValidation.PriorityMessage);

        RuleFor(c => c.Items)
            .Must(items => items is { Count: >= 1 and <= BulkGrantCommand.MaxItems }).WithMessage(BulkGrantValidator.ItemCountMessage);

        RuleForEach(c => c.Items)
            .NotNull().WithMessage("Item is required.")
            .ChildRules(item =>
                item.RuleFor(i => i.ClusterName).NotEmpty().WithMessage("Cluster is required."))
            .When(c => c.Items is not null);

        // Second and later occurrences are marked, as in the user bulk grant. Ordinal: names are case-sensitive keys.
        RuleFor(c => c.Items).Custom((items, context) =>
        {
            var seen = new HashSet<string>(StringComparer.Ordinal);
            for (var i = 0; i < items.Count; i++)
            {
                if (items[i]?.ClusterName is { Length: > 0 } name && !seen.Add(name))
                {
                    context.AddFailure($"{nameof(BulkGroupGrantCommand.Items)}[{i}].{nameof(BulkGrantItem.ClusterName)}", BulkGrantValidator.DuplicateClusterMessage);
                }
            }
        }).When(c => c.Items is not null);
    }
}
