using System.Diagnostics;

namespace FleetConsole.Application;

/// <summary>
/// Telemetry identity of the Application layer. The host must subscribe to <see cref="ActivitySourceName"/> (the Api does
/// in <c>Program.cs</c>) for the per-request spans created by <c>LoggingBehavior</c> to be exported, and to
/// <see cref="MeterName"/> for the Application's metrics (e.g. the fleet probe duration).
/// </summary>
public static class ApplicationDiagnostics
{
    /// <summary>Name of the <see cref="System.Diagnostics.ActivitySource"/> used for dispatched commands and queries.</summary>
    public const string ActivitySourceName = "FleetConsole.Application";

    /// <summary>
    /// Name of the <see cref="System.Diagnostics.Metrics.Meter"/> of the Application layer's instruments (created through
    /// <see cref="System.Diagnostics.Metrics.IMeterFactory"/>, so the host's metrics pipeline owns its lifetime).
    /// </summary>
    public const string MeterName = "FleetConsole.Application";

    /// <summary>The shared activity source; one instance per process, as recommended for <see cref="System.Diagnostics.ActivitySource"/>.</summary>
    internal static ActivitySource ActivitySource { get; } = new(ActivitySourceName);
}
