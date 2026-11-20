using Microsoft.Extensions.Hosting;

namespace FleetConsole.Infrastructure.Persistence;

/// <summary>
/// Development convenience: applies pending EF Core migrations when the host starts, so <c>aspire run</c> and the
/// integration tests always see an up-to-date schema. Registered by <c>AddInfrastructure</c> in Development only;
/// production runs the same <see cref="DatabaseMigrator"/> through the image's <c>migrate</c> mode as an init
/// container (ADR-0027).
/// </summary>
/// <remarks>
/// Hosted services start before Kestrel accepts requests, so no request ever sees an unmigrated database. A failed
/// migration fails startup, which is what we want in development.
/// </remarks>
/// <param name="services">The root services, handed to the migrator (which creates its own scope).</param>
internal sealed class DevelopmentDatabaseMigrator(IServiceProvider services) : IHostedService
{
    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken) => DatabaseMigrator.MigrateAsync(services, cancellationToken);

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
