using FleetConsole.Application.Abstractions;

namespace FleetConsole.Application.Tests.Behaviors;

/// <summary>In-memory fake of the unit of work port that counts commits.</summary>
internal sealed class FakeUnitOfWork : IUnitOfWork
{
    public int SaveCount { get; private set; }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        SaveCount++;
        return Task.CompletedTask;
    }
}
