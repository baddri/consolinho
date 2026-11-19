using FluentValidation;

namespace FleetConsole.Application.Audit.ListAuditEntries;

/// <summary>
/// Field rules for <see cref="ListAuditEntriesQuery"/> (contract §10): errors are keyed by the query-string parameter
/// name (<c>limit</c>, <c>category</c>, <c>cursor</c>, <c>to</c>) so the audit page can show them next to its filters.
/// </summary>
internal sealed class ListAuditEntriesValidator : AbstractValidator<ListAuditEntriesQuery>
{
    /// <summary>Declares the rules.</summary>
    public ListAuditEntriesValidator()
    {
        RuleFor(q => q.Limit)
            .InclusiveBetween(1, ListAuditEntriesQuery.MaxLimit)
            .WithMessage($"Limit must be between 1 and {ListAuditEntriesQuery.MaxLimit}.");

        RuleFor(q => q.Category)
            .Must(category => AuditCategoryNames.TryParse(category, out _))
            .When(q => q.Category is not null)
            .WithMessage($"Category must be one of: {string.Join(", ", AuditCategoryNames.All)}.");

        RuleFor(q => q.Cursor)
            .Must(cursor => AuditCursor.TryParse(cursor, out _))
            .When(q => q.Cursor is not null)
            .WithMessage("Cursor is not a value returned by this API. Start again from the first page.");

        RuleFor(q => q.To)
            .Must((q, to) => q.From < to)
            .When(q => q.From is not null && q.To is not null)
            .WithMessage("'to' must be later than 'from'.");
    }
}
