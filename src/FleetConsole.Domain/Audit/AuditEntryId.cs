namespace FleetConsole.Domain.Audit;

/// <summary>Strongly typed identity of an <see cref="AuditEntry"/>.</summary>
/// <param name="Value">The underlying GUID (version 7, so ids roughly follow insertion order).</param>
public readonly record struct AuditEntryId(Guid Value)
{
    /// <summary>Creates a new, time-ordered (version 7) identity for an entry being recorded.</summary>
    /// <returns>A fresh <see cref="AuditEntryId"/>.</returns>
    public static AuditEntryId New() => new(Guid.CreateVersion7());
}
