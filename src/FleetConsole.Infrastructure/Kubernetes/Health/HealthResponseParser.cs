using System.Text.Json;
using FleetConsole.Application.Abstractions.Kubernetes;

namespace FleetConsole.Infrastructure.Kubernetes.Health;

/// <summary>
/// Reduces the fleet health probes' JSON answers (contract §3) to the facts of <see cref="ClusterHealthReading"/>, by
/// walking a <see cref="JsonDocument"/> instead of binding model classes for whole objects.
/// </summary>
/// <remarks>
/// Every method returns <see langword="null"/> when the document is not the expected answer (wrong <c>kind</c>, a Table
/// without the needed column, a missing required field); the reader maps that to <see cref="ProbeFailureKind.InvalidResponse"/>.
/// Table columns are located by <c>columnDefinitions[].name</c> (case-insensitive), never by position.
/// </remarks>
internal static class HealthResponseParser
{
    private static readonly JsonElement EmptyArray = CreateEmptyArray();

    /// <summary>Reads <c>gitVersion</c> from <c>GET /version</c>.</summary>
    /// <param name="root">The document root.</param>
    /// <returns>The facts, or <see langword="null"/> without a non-empty <c>gitVersion</c>.</returns>
    public static KubernetesVersionFacts? KubernetesVersion(JsonElement root) =>
        StringProperty(root, "gitVersion") is { Length: > 0 } gitVersion ? new KubernetesVersionFacts(gitVersion) : null;

    /// <summary>
    /// Reads the <c>version</c> ClusterVersion: the current version is the newest <c>status.history[]</c> entry with
    /// <c>state == Completed</c> (OpenShift lists history newest first), else <c>status.desired.version</c>; conditions
    /// <c>Available</c>/<c>Progressing</c>/<c>Failing</c> by type; the <c>status.availableUpdates</c> count.
    /// </summary>
    /// <param name="root">The document root.</param>
    /// <returns>The facts, or <see langword="null"/> when <c>kind</c> is not <c>ClusterVersion</c>.</returns>
    public static ClusterVersionFacts? ClusterVersion(JsonElement root)
    {
        if (!IsKind(root, "ClusterVersion"))
        {
            return null;
        }

        var status = Property(root, "status");
        var desiredVersion = StringProperty(Property(status, "desired"), "version");

        string? completedVersion = null;
        foreach (var entry in Items(status, "history"))
        {
            if (StringProperty(entry, "state") == "Completed" && StringProperty(entry, "version") is { Length: > 0 } version)
            {
                completedVersion = version;
                break;
            }
        }

        bool? available = null, progressing = null, failing = null;
        foreach (var condition in Items(status, "conditions"))
        {
            var isTrue = StringProperty(condition, "status") == "True";
            switch (StringProperty(condition, "type"))
            {
                case "Available": available = isTrue; break;
                case "Progressing": progressing = isTrue; break;
                case "Failing": failing = isTrue; break;
            }
        }

        return new ClusterVersionFacts(
            completedVersion ?? NullIfEmpty(desiredVersion),
            NullIfEmpty(desiredVersion),
            available,
            progressing,
            failing,
            Items(status, "availableUpdates").Count());
    }

    /// <summary>
    /// Counts ClusterOperators from their Table: <c>Available != True</c> → unavailable, <c>Degraded == True</c>,
    /// <c>Progressing == True</c>.
    /// </summary>
    /// <param name="root">The document root.</param>
    /// <returns>The counts, or <see langword="null"/> when this is not a Table with all three columns.</returns>
    public static ClusterOperatorCounts? ClusterOperators(JsonElement root)
    {
        if (TableColumns(root, "Available", "Progressing", "Degraded") is not { } columns)
        {
            return null;
        }

        int total = 0, degraded = 0, unavailable = 0, progressing = 0;
        foreach (var cells in TableRows(root))
        {
            total++;
            if (Cell(cells, columns[0]) != "True")
            {
                unavailable++;
            }

            if (Cell(cells, columns[1]) == "True")
            {
                progressing++;
            }

            if (Cell(cells, columns[2]) == "True")
            {
                degraded++;
            }
        }

        return new ClusterOperatorCounts(total, degraded, unavailable, progressing);
    }

    /// <summary>
    /// Counts nodes from their Table's <c>Status</c> column, a comma list such as <c>Ready,SchedulingDisabled</c>: the
    /// first item <c>Ready</c> → ready (NotReady/Unknown are not); any item <c>SchedulingDisabled</c> → unschedulable.
    /// </summary>
    /// <param name="root">The document root.</param>
    /// <returns>The counts, or <see langword="null"/> when this is not a Table with a <c>Status</c> column.</returns>
    public static NodeCounts? Nodes(JsonElement root)
    {
        if (TableColumns(root, "Status") is not { } columns)
        {
            return null;
        }

        int total = 0, ready = 0, unschedulable = 0;
        foreach (var cells in TableRows(root))
        {
            total++;
            var items = (Cell(cells, columns[0]) ?? string.Empty).Split(',', StringSplitOptions.TrimEntries);
            if (items[0] == "Ready")
            {
                ready++;
            }

            if (items.Contains("SchedulingDisabled", StringComparer.Ordinal))
            {
                unschedulable++;
            }
        }

        return new NodeCounts(total, ready, unschedulable);
    }

    /// <summary>Indexes of <paramref name="names"/> in a <c>meta.k8s.io</c> Table, or <see langword="null"/> if any is missing.</summary>
    private static int[]? TableColumns(JsonElement root, params string[] names)
    {
        if (!IsKind(root, "Table"))
        {
            return null;
        }

        var definitions = Items(root, "columnDefinitions")
            .Select(definition => StringProperty(definition, "name"))
            .ToList();

        var indexes = new int[names.Length];
        for (var i = 0; i < names.Length; i++)
        {
            var name = names[i];
            indexes[i] = definitions.FindIndex(candidate => string.Equals(candidate, name, StringComparison.OrdinalIgnoreCase));
            if (indexes[i] < 0)
            {
                return null;
            }
        }

        return indexes;
    }

    /// <summary>The <c>cells</c> array of every row (an absent <c>rows</c> is an empty Table).</summary>
    private static IEnumerable<JsonElement> TableRows(JsonElement root) =>
        Items(root, "rows").Select(row => Property(row, "cells"));

    /// <summary>A cell's text; non-string or missing cells read as <see langword="null"/>.</summary>
    private static string? Cell(JsonElement cells, int index) =>
        cells.ValueKind == JsonValueKind.Array && index < cells.GetArrayLength() && cells[index].ValueKind == JsonValueKind.String
            ? cells[index].GetString()
            : null;

    private static bool IsKind(JsonElement root, string kind) => StringProperty(root, "kind") == kind;

    private static JsonElement Property(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) ? value : default;

    private static string? StringProperty(JsonElement element, string name) =>
        Property(element, name) is { ValueKind: JsonValueKind.String } value ? value.GetString() : null;

    /// <summary>The items of an array property; a missing, null or non-array property reads as empty.</summary>
    private static JsonElement.ArrayEnumerator Items(JsonElement element, string name) =>
        (Property(element, name) is { ValueKind: JsonValueKind.Array } value ? value : EmptyArray).EnumerateArray();

    private static JsonElement CreateEmptyArray()
    {
        using var document = JsonDocument.Parse("[]");
        return document.RootElement.Clone();
    }

    private static string? NullIfEmpty(string? value) => string.IsNullOrEmpty(value) ? null : value;
}
