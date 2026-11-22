using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Credentials;

/// <summary>
/// The namespaces a credential's connection test lists the token's access rules in (NST-2/5). Saved on the
/// <see cref="Credential"/> so the test dialog can prefill them, and later used as the namespace-picker fallback for
/// users who may not list namespaces (CP5.5).
/// </summary>
/// <remarks>
/// <para>Instances only come from <see cref="Create"/> (or <see cref="Empty"/>). Invariants: 0 to <see cref="MaxCount"/>
/// entries, each a DNS-1123 label of at most <see cref="MaxLength"/> characters, distinct, in input order.</para>
/// <para>Errors are field errors keyed by the request JSON names: <c>inspectNamespaces[i]</c> for a bad entry (i is the
/// index in the <em>input</em>) and <c>inspectNamespaces</c> for too many entries. All entry errors are reported at once.</para>
/// <para>Equality compares <see cref="Values"/> element by element, so EF change tracking sees an equal list as unchanged.</para>
/// </remarks>
public sealed record InspectNamespaces
{
    /// <summary>The request/JSON field the errors are reported on (entries as <c>inspectNamespaces[i]</c>).</summary>
    public const string FieldName = "inspectNamespaces";

    /// <summary>Maximum number of distinct namespaces.</summary>
    public const int MaxCount = 10;

    /// <summary>Maximum length of one namespace name (a Kubernetes namespace is a DNS label).</summary>
    public const int MaxLength = 63;

    /// <summary>
    /// Maximum number of <c>inspectNamespaces[i]</c> errors reported for one input, so a huge bad request cannot produce a
    /// huge ProblemDetails body. Later bad entries still fail the input; they are just not listed.
    /// </summary>
    public const int MaxEntryErrors = MaxCount;

    /// <summary>The message when more than <see cref="MaxCount"/> distinct names are given.</summary>
    public static readonly string TooManyMessage = $"Enter at most {MaxCount} namespaces.";

    /// <summary>The message when an entry is empty or whitespace only.</summary>
    public const string BlankMessage = "Namespace name must not be empty.";

    private InspectNamespaces(IReadOnlyList<string> values)
    {
        Values = values;
    }

    /// <summary>No namespaces: the default of every credential and the result for null or empty input.</summary>
    public static InspectNamespaces Empty { get; } = new([]);

    /// <summary>The namespace names, trimmed, distinct, in the order they were given.</summary>
    public IReadOnlyList<string> Values { get; }

    /// <summary>Validates and normalises a namespace list from a request or the database.</summary>
    /// <remarks>
    /// Normalisation order: trim → reject blank/invalid → remove duplicates (first wins) → count ≤ <see cref="MaxCount"/>.
    /// The input is an unbounded request array, so the work is linear and bounded: duplicates are found with a set, at
    /// most <see cref="MaxEntryErrors"/> entry errors are reported, and names beyond <see cref="MaxCount"/> + 1 distinct
    /// are not kept (the count error is already certain).
    /// </remarks>
    /// <param name="values">The names; <see langword="null"/> or empty means none. A <see langword="null"/> entry counts as blank.</param>
    /// <returns>The list, or a <see cref="ValidationError"/> with one entry per bad name (up to the cap) plus the count error.</returns>
    public static Result<InspectNamespaces> Create(IEnumerable<string>? values)
    {
        if (values is null)
        {
            return Empty;
        }

        var errors = new Dictionary<string, string[]>();
        var entryErrors = 0;
        var distinct = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var index = 0;
        foreach (var raw in values)
        {
            var name = raw?.Trim() ?? string.Empty;
            var message = name.Length == 0 ? BlankMessage
                : !DnsLabel.IsValid(name, MaxLength) ? InvalidMessage(name)
                : null;
            if (message is not null)
            {
                if (entryErrors < MaxEntryErrors)
                {
                    errors[$"{FieldName}[{index}]"] = [message];
                }

                entryErrors++;
            }
            else if (distinct.Count <= MaxCount && seen.Add(name))
            {
                distinct.Add(name);
            }

            // Nothing more to report: the entry-error cap is reached and the count error is certain.
            if (entryErrors >= MaxEntryErrors && distinct.Count > MaxCount)
            {
                break;
            }

            index++;
        }

        // Counted after de-duplication: ["a", "a", …] with 11 entries but 10 distinct names is fine.
        if (distinct.Count > MaxCount)
        {
            errors[FieldName] = [TooManyMessage];
        }

        if (errors.Count > 0)
        {
            return Error.Validation(errors);
        }

        return distinct.Count == 0 ? Empty : new InspectNamespaces(distinct.AsReadOnly());
    }

    /// <summary>The message for an entry that is not a namespace name; it quotes the (trimmed) entry.</summary>
    /// <param name="name">The rejected entry.</param>
    /// <returns>For example <c>'Team_A' is not a valid namespace name: …</c>.</returns>
    public static string InvalidMessage(string name) =>
        $"'{name}' is not a valid namespace name: at most {MaxLength} characters: lowercase letters, digits and '-', starting and ending with a letter or digit.";

    /// <summary>Element-wise equality over <see cref="Values"/> (records would otherwise compare the list by reference).</summary>
    /// <param name="other">The other list.</param>
    /// <returns><see langword="true"/> when both hold the same names in the same order.</returns>
    public bool Equals(InspectNamespaces? other) =>
        other is not null && Values.SequenceEqual(other.Values, StringComparer.Ordinal);

    /// <summary>Hash over the names in order, consistent with <see cref="Equals(InspectNamespaces?)"/>.</summary>
    /// <returns>The hash code.</returns>
    public override int GetHashCode()
    {
        var hash = new HashCode();
        foreach (var value in Values)
        {
            hash.Add(value, StringComparer.Ordinal);
        }

        return hash.ToHashCode();
    }

    /// <summary>The names joined with <c>, </c>, for logs and test output.</summary>
    /// <returns>For example <c>team-a, team-b</c>.</returns>
    public override string ToString() => string.Join(", ", Values);
}
