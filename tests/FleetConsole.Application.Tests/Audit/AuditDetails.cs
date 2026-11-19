using System.Text.Json;
using FleetConsole.Application.Audit;

namespace FleetConsole.Application.Tests.Audit;

/// <summary>
/// Reads an <see cref="AuditRecord"/>'s details exactly as <see cref="AuditTrail"/> would store them, so handler tests
/// assert the JSON shape of contract §10 rather than the C# anonymous type.
/// </summary>
internal static class AuditDetails
{
    public static JsonElement Of(AuditRecord record)
    {
        using var document = JsonDocument.Parse(AuditTrail.SerializeDetails(record.Details));
        return document.RootElement.Clone();
    }

    /// <summary>
    /// Asserts the details object has exactly <paramref name="names"/> as properties (in any order). Exact matching is
    /// also the guard against secrets: nothing beyond the documented fields (fingerprints, never tokens) can slip in.
    /// </summary>
    public static JsonElement ShouldHaveExactly(this JsonElement details, params string[] names)
    {
        details.ValueKind.ShouldBe(JsonValueKind.Object);
        details.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal)
            .ShouldBe(names.Order(StringComparer.Ordinal));
        return details;
    }

    public static string? Str(this JsonElement details, string name) => details.GetProperty(name).GetString();

    public static bool IsNull(this JsonElement details, string name) =>
        details.GetProperty(name).ValueKind == JsonValueKind.Null;
}
