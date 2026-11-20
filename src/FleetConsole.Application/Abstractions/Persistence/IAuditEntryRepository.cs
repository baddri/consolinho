using FleetConsole.Domain.Audit;

namespace FleetConsole.Application.Abstractions.Persistence;

/// <summary>
/// Append-only store of <see cref="AuditEntry"/> rows (AUD-3): there is deliberately no way to load an entry for
/// modification or to remove one. Used only by the Application's audit trail (ADR-0008), which stages entries in the
/// same unit of work as the change they describe; the audit-log query reads through <see cref="IReadModel"/>.
/// </summary>
public interface IAuditEntryRepository
{
    /// <summary>Stages an entry; it is written in the same transaction as the command's other changes.</summary>
    /// <param name="entry">The entry to append.</param>
    void Add(AuditEntry entry);
}
