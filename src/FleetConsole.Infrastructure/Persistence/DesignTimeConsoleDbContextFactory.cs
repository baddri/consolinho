using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace FleetConsole.Infrastructure.Persistence;

/// <summary>
/// Lets <c>dotnet ef migrations add</c> build <see cref="ConsoleDbContext"/> without starting the Api host (which would
/// need a connection string and the whole composition root). Only used by the EF tooling.
/// </summary>
/// <remarks>Uses the same <see cref="ConsoleDbContext.ConfigureProvider"/> as runtime, so generated migrations match.</remarks>
internal sealed class DesignTimeConsoleDbContextFactory : IDesignTimeDbContextFactory<ConsoleDbContext>
{
    /// <inheritdoc />
    public ConsoleDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<ConsoleDbContext>();
        ConsoleDbContext.ConfigureProvider(options, connectionString: null);
        return new ConsoleDbContext(options.Options, new DesignTimeDomainEventDispatcher());
    }

    /// <summary>
    /// The tooling only reads the model and never saves, so there is nothing to dispatch; refusing makes an accidental
    /// save through a design-time context fail loudly instead of skipping the audit trail.
    /// </summary>
    private sealed class DesignTimeDomainEventDispatcher : IDomainEventDispatcher
    {
        public Task DispatchAsync(IReadOnlyList<IDomainEvent> domainEvents, CancellationToken cancellationToken) =>
            throw new NotSupportedException("The design-time ConsoleDbContext is for EF tooling only and never saves.");

        // Unreachable in practice (DispatchAsync refuses every save first); a no-op keeps the post-commit stage harmless.
        public Task DispatchPostCommitAsync(IReadOnlyList<IDomainEvent> domainEvents, CancellationToken cancellationToken) =>
            Task.CompletedTask;
    }
}
