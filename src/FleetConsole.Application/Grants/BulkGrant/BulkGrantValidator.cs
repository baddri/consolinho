using FluentValidation;

namespace FleetConsole.Application.Grants.BulkGrant;

/// <summary>
/// Shape rules of <see cref="BulkGrantCommand"/> (contract §9.4): 1 to 100 items, each with a cluster name, no cluster
/// twice. Item problems that need the database are the handler's field errors.
/// </summary>
internal sealed class BulkGrantValidator : AbstractValidator<BulkGrantCommand>
{
    /// <summary>The message for an empty or too long item list.</summary>
    public static readonly string ItemCountMessage = $"Select between 1 and {BulkGrantCommand.MaxItems} clusters.";

    /// <summary>The message on a cluster that appears in an earlier item already.</summary>
    public const string DuplicateClusterMessage = "Cluster listed twice.";

    /// <summary>Defines the rules.</summary>
    public BulkGrantValidator()
    {
        RuleFor(c => c.AccessMode).IsInEnum().WithMessage(GrantValidation.AccessModeMessage);

        RuleFor(c => c.Items)
            .Must(items => items is { Count: >= 1 and <= BulkGrantCommand.MaxItems }).WithMessage(ItemCountMessage);

        RuleForEach(c => c.Items)
            .NotNull().WithMessage("Item is required.")
            .ChildRules(item =>
                item.RuleFor(i => i.ClusterName).NotEmpty().WithMessage("Cluster is required."))
            .When(c => c.Items is not null);

        // The second and later occurrences are marked, so the review table points at the rows to remove. Ordinal: names
        // are case-sensitive keys.
        RuleFor(c => c.Items).Custom((items, context) =>
        {
            var seen = new HashSet<string>(StringComparer.Ordinal);
            for (var i = 0; i < items.Count; i++)
            {
                if (items[i]?.ClusterName is { Length: > 0 } name && !seen.Add(name))
                {
                    context.AddFailure($"{nameof(BulkGrantCommand.Items)}[{i}].{nameof(BulkGrantItem.ClusterName)}", DuplicateClusterMessage);
                }
            }
        }).When(c => c.Items is not null);
    }
}
