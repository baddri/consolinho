using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Audit;

namespace FleetConsole.Infrastructure.Persistence.Repositories;

/// <summary>
/// EF Core implementation of the append-only <see cref="IAuditEntryRepository"/>: entries are only ever added to the
/// request's context and written with the rest of the unit of work (ADR-0008).
/// </summary>
/// <param name="db">The scoped context, shared with the unit of work.</param>
internal sealed class AuditEntryRepository(ConsoleDbContext db) : IAuditEntryRepository
{
    /// <inheritdoc />
    public void Add(AuditEntry entry) => db.Set<AuditEntry>().Add(entry);
}
