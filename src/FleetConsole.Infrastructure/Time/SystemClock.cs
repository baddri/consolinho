using FleetConsole.Application.Abstractions;

namespace FleetConsole.Infrastructure.Time;

/// <summary>The real wall clock behind <see cref="IClock"/>; tests substitute a fixed clock instead.</summary>
internal sealed class SystemClock : IClock
{
    /// <inheritdoc />
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}
