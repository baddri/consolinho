using FleetConsole.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace FleetConsole.Api.Tests.Integration;

[Collection(ApiCollectionDefinition.Name)]
public sealed class DatabaseTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Startup_InDevelopment_AppliesAllMigrations()
    {
        // Creating a client starts the host, which runs the development migrator before serving requests.
        using var client = factory.CreateApiClient();
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ConsoleDbContext>();

        (await db.Database.GetAppliedMigrationsAsync(Ct)).ShouldContain(id => id.EndsWith("_Initial", StringComparison.Ordinal));
        (await db.Database.GetPendingMigrationsAsync(Ct)).ShouldBeEmpty();
    }

    [Fact]
    public async Task MigrationsHistoryTable_UsesSnakeCaseName()
    {
        using var client = factory.CreateApiClient();
        await using var connection = new NpgsqlConnection(factory.ConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand(
            "select count(*) from information_schema.tables where table_schema = 'public' and table_name = @name", connection);
        command.Parameters.AddWithValue("name", ConsoleDbContext.MigrationsHistoryTable);

        var count = (long)(await command.ExecuteScalarAsync(Ct))!;

        count.ShouldBe(1);
    }
}
