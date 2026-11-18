using FleetConsole.Infrastructure.Events;
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
        return new ConsoleDbContext(options.Options, new NoOpDomainEventDispatcher());
    }
}
