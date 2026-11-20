using FleetConsole.Application.Abstractions;

namespace FleetConsole.Application.Tests.Behaviors;

/// <summary>In-memory fake of the unit of work port that counts commits and can simulate a failing commit.</summary>
internal sealed class FakeUnitOfWork : IUnitOfWork
{
    public int SaveCount { get; private set; }

    /// <summary>When set, <see cref="SaveChangesAsync"/> throws it (after counting the attempt).</summary>
    public Exception? ThrowOnSave { get; set; }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        SaveCount++;
        return ThrowOnSave is null ? Task.CompletedTask : Task.FromException(ThrowOnSave);
    }
}
