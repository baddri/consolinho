using FleetConsole.Api.Tests.Integration;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace FleetConsole.Api.Tests.Persistence;

/// <summary>
/// An additional in-process Api host over a given database, configured like <c>ApiFactory</c> (Development, so the
/// schema is migrated on startup). Used to prove that state in the database, such as the Data Protection key ring, is
/// shared between host instances (replicas, restarts) and isolated between databases.
/// </summary>
/// <remarks>Uses the offline login configuration: these hosts never log anyone in, and must not call out.</remarks>
/// <param name="connectionString">The PostgreSQL connection string of the database to use.</param>
internal sealed class ApiHostOverDatabase(string connectionString) : WebApplicationFactory<Program>
{
    /// <inheritdoc />
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting($"ConnectionStrings:{ConsoleDbContext.ConnectionName}", connectionString);
        foreach (var (key, value) in TestHostConfiguration.Offline())
        {
            builder.UseSetting(key, value);
        }
    }
}
