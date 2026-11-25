using System.Diagnostics.Metrics;

namespace FleetConsole.Application.Tests.Fleet;

/// <summary>A minimal <see cref="IMeterFactory"/> (the host's comes from AddMetrics); meters are scoped to it, so a
/// <c>MetricCollector</c> created with this factory sees only this test's measurements.</summary>
internal sealed class TestMeterFactory : IMeterFactory
{
    private readonly List<Meter> _meters = [];

    public Meter Create(MeterOptions options)
    {
        var meter = new Meter(options.Name, options.Version, options.Tags, scope: this);
        lock (_meters)
        {
            _meters.Add(meter);
        }

        return meter;
    }

    public void Dispose()
    {
        lock (_meters)
        {
            foreach (var meter in _meters)
            {
                meter.Dispose();
            }

            _meters.Clear();
        }
    }
}
