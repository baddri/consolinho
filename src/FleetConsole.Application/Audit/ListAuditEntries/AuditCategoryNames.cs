using System.Collections.Frozen;
using FleetConsole.Domain.Audit;

namespace FleetConsole.Application.Audit.ListAuditEntries;

/// <summary>
/// The wire names of <see cref="AuditCategory"/> (camelCase, as the API serializes enums, ADR-0013) for the
/// string-bound <c>category</c> filter. Parsing by name only, so numeric strings such as <c>"2"</c> are rejected even
/// though <see cref="Enum.TryParse{TEnum}(string, bool, out TEnum)"/> would accept them.
/// </summary>
internal static class AuditCategoryNames
{
    private static readonly FrozenDictionary<string, AuditCategory> ByName = Enum.GetValues<AuditCategory>()
        .ToFrozenDictionary(ToWireName, c => c, StringComparer.OrdinalIgnoreCase);

    /// <summary>All wire names, in declaration order (for messages).</summary>
    public static IReadOnlyList<string> All { get; } = Enum.GetValues<AuditCategory>().Select(ToWireName).ToArray();

    /// <summary>Maps a wire name (case-insensitive) to the category.</summary>
    /// <param name="name">The query-string value.</param>
    /// <param name="category">The category when known.</param>
    /// <returns><see langword="true"/> for a known name.</returns>
    public static bool TryParse(string? name, out AuditCategory category)
    {
        category = default;
        return name is not null && ByName.TryGetValue(name, out category);
    }

    private static string ToWireName(AuditCategory category)
    {
        var name = category.ToString();
        return string.Concat(name[..1].ToLowerInvariant(), name[1..]);
    }
}
