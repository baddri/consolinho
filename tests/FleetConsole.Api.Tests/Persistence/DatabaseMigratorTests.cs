using FleetConsole.Api.Tests.Integration;
using FleetConsole.Infrastructure;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace FleetConsole.Api.Tests.Persistence;

/// <summary>
/// DB-1 (ADR-0027): the shared migrator behind the <c>migrate</c> init container and the Development auto-migration
/// applies every migration to a fresh database (creating it), is a no-op on the second run, and tolerates concurrent pods.
/// Runs against fresh databases on the shared Postgres container, through a Production host that is never started — as
/// in migrate mode.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class DatabaseMigratorTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task FreshDatabase_AppliesAllMigrations_ThenNone()
    {
        using var host = MigrationHost(FreshDatabase());

        var first = await DatabaseMigrator.MigrateAsync(host.Services, Ct);
        var second = await DatabaseMigrator.MigrateAsync(host.Services, Ct);

        first.ShouldBe(AllMigrations(host));
        first.ShouldNotBeEmpty();
        second.ShouldBeEmpty();
    }

    [Fact]
    public async Task ConcurrentRuns_BothSucceed_AndLeaveTheSchemaUpToDate()
    {
        var connectionString = FreshDatabase();
        using var podA = MigrationHost(connectionString);
        using var podB = MigrationHost(connectionString);

        await Task.WhenAll(
            DatabaseMigrator.MigrateAsync(podA.Services, Ct),
            DatabaseMigrator.MigrateAsync(podB.Services, Ct));

        (await DatabaseMigrator.MigrateAsync(podA.Services, Ct)).ShouldBeEmpty();
    }

    private string FreshDatabase() => factory.Postgres.ConnectionStringFor($"migrator_{Guid.NewGuid():N}");

    private static IHost MigrationHost(string connectionString)
    {
        var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
        {
            EnvironmentName = Environments.Production,
            DisableDefaults = true,
        });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            [$"ConnectionStrings:{ConsoleDbContext.ConnectionName}"] = connectionString,
        });
        builder.AddInfrastructure();
        return builder.Build();
    }

    private static string[] AllMigrations(IHost host)
    {
        using var scope = host.Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<ConsoleDbContext>().Database.GetMigrations().ToArray();
    }
}
