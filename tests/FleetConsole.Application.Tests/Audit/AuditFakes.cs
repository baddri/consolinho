using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Audit;
using FleetConsole.Domain.Audit;

namespace FleetConsole.Application.Tests.Audit;

/// <summary>A clock frozen at <see cref="Now"/>.</summary>
internal sealed class FixedClock : IClock
{
    public static readonly DateTimeOffset Now = new(2026, 11, 19, 10, 30, 0, TimeSpan.Zero);

    public DateTimeOffset UtcNow => Now;
}

/// <summary>Collects staged audit entries instead of writing them.</summary>
internal sealed class CapturingAuditEntryRepository : IAuditEntryRepository
{
    public List<AuditEntry> Entries { get; } = [];

    public void Add(AuditEntry entry) => Entries.Add(entry);
}

/// <summary>Collects the records handlers pass to the audit trail (handler unit tests).</summary>
internal sealed class RecordingAuditTrail : IAuditTrail
{
    public List<AuditRecord> Records { get; } = [];

    public AuditRecord Single => Records.ShouldHaveSingleItem();

    public void Record(AuditRecord record) => Records.Add(record);
}
