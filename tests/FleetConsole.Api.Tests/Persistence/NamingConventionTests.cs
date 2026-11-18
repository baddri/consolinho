using FleetConsole.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace FleetConsole.Api.Tests.Persistence;

/// <summary>
/// Proves that <see cref="ConsoleDbContext.ConfigureProvider"/> (the single place the console's EF Core provider is
/// configured) applies snake_case naming to tables, columns and keys, not only to the migrations history table.
/// <see cref="ConsoleDbContext"/> has no entities in CP0, so a probe context with one entity is configured through the
/// same method. CP0 QA, spec criterion 6.
/// </summary>
public sealed class NamingConventionTests
{
    [Fact]
    public void ConfigureProvider_MapsTablesColumnsAndKeysToSnakeCase()
    {
        using var db = new ProbeDbContext();

        var entity = db.Model.FindEntityType(typeof(ClusterCredentialProbe)).ShouldNotBeNull();

        entity.GetTableName().ShouldBe("cluster_credential_probe");
        entity.FindProperty(nameof(ClusterCredentialProbe.DisplayName))!.GetColumnName().ShouldBe("display_name");
        entity.FindProperty(nameof(ClusterCredentialProbe.ApiServerUrl))!.GetColumnName().ShouldBe("api_server_url");
        entity.FindPrimaryKey()!.GetName().ShouldBe("pk_cluster_credential_probe");
    }

    private sealed class ClusterCredentialProbe
    {
        public Guid Id { get; set; }

        public string DisplayName { get; set; } = string.Empty;

        public string ApiServerUrl { get; set; } = string.Empty;
    }

    private sealed class ProbeDbContext : DbContext
    {
        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) =>
            ConsoleDbContext.ConfigureProvider(optionsBuilder, connectionString: null);

        protected override void OnModelCreating(ModelBuilder modelBuilder) => modelBuilder.Entity<ClusterCredentialProbe>();
    }
}
