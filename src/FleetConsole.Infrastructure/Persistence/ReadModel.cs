using FleetConsole.Application.Abstractions;

namespace FleetConsole.Infrastructure.Persistence;

/// <summary>
/// EF Core implementation of <see cref="IReadModel"/>. Placeholder until the first aggregate is persisted: it will take
/// <see cref="ConsoleDbContext"/> and expose each readable set as <c>AsNoTracking()</c> queryables.
/// </summary>
internal sealed class ReadModel : IReadModel;
