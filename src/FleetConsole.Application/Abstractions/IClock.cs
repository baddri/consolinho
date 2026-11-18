namespace FleetConsole.Application.Abstractions;

/// <summary>
/// Port for the current time, so use cases (and the timestamps they pass into aggregates) are deterministic in tests.
/// Never call <see cref="DateTimeOffset.UtcNow"/> directly in Application or Domain code.
/// </summary>
/// <remarks>Implemented by Infrastructure (<c>SystemClock</c>, T-0004); tests use a fixed fake.</remarks>
public interface IClock
{
    /// <summary>The current instant, in UTC.</summary>
    DateTimeOffset UtcNow { get; }
}
