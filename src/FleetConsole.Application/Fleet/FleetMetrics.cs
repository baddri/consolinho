using System.Diagnostics.Metrics;

namespace FleetConsole.Application.Fleet;

/// <summary>
/// The fleet overview's instruments on the <see cref="ApplicationDiagnostics.MeterName"/> meter (ADR-0041 §6, FBE-6).
/// Registered as a singleton: the meter comes from <see cref="IMeterFactory"/>, which caches it per name and disposes it
/// with the container.
/// </summary>
internal sealed class FleetMetrics
{
    /// <summary>Name of the histogram of upstream probe durations (one record per cache miss).</summary>
    public const string ProbeDurationName = "fleetconsole.fleet.probe.duration";

    /// <summary>The tag carrying the probe's outcome category (a failure value, <c>ok</c> or <c>restricted</c>).</summary>
    public const string OutcomeTag = "outcome";

    private readonly Histogram<double> _probeDuration;

    /// <summary>Creates the instruments.</summary>
    /// <param name="meterFactory">The host's meter factory.</param>
    public FleetMetrics(IMeterFactory meterFactory)
    {
        ArgumentNullException.ThrowIfNull(meterFactory);
        var meter = meterFactory.Create(ApplicationDiagnostics.MeterName);
        _probeDuration = meter.CreateHistogram<double>(
            ProbeDurationName,
            unit: "ms",
            description: "Duration of one cluster's fleet health probes (cache misses only).");
    }

    /// <summary>Records one probe's duration.</summary>
    /// <param name="elapsedMilliseconds">How long the probe took, decrypt and upstream calls included.</param>
    /// <param name="outcome">The outcome category (low cardinality: failure values, <c>ok</c>, <c>restricted</c>).</param>
    public void RecordProbe(double elapsedMilliseconds, string outcome) =>
        _probeDuration.Record(elapsedMilliseconds, new KeyValuePair<string, object?>(OutcomeTag, outcome));
}
