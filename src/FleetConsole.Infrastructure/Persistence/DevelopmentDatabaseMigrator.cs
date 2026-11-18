using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Infrastructure.Persistence;

/// <summary>
/// Development convenience: applies pending EF Core migrations when the host starts, so <c>aspire run</c> and the
/// integration tests always see an up-to-date schema. Registered by <c>AddInfrastructure</c> in Development only;
/// production applies migrations with a separate migration job before rollout (BACKEND.md "Persistence").
/// </summary>
/// <remarks>
/// Hosted services start before Kestrel accepts requests, so no request ever sees an unmigrated database. A failed
/// migration fails startup, which is what we want in development.
/// </remarks>
internal sealed partial class DevelopmentDatabaseMigrator(IServiceScopeFactory scopeFactory, ILogger<DevelopmentDatabaseMigrator> logger)
    : IHostedService
{
    /// <inheritdoc />
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var scope = scopeFactory.CreateAsyncScope();
        await using (scope.ConfigureAwait(false))
        {
            var db = scope.ServiceProvider.GetRequiredService<ConsoleDbContext>();
            LogMigrating(logger);
            await db.Database.MigrateAsync(cancellationToken).ConfigureAwait(false);
            LogMigrated(logger);
        }
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    [LoggerMessage(Level = LogLevel.Information, Message = "Development: applying pending database migrations")]
    private static partial void LogMigrating(ILogger logger);

    [LoggerMessage(Level = LogLevel.Information, Message = "Development: database schema is up to date")]
    private static partial void LogMigrated(ILogger logger);
}
