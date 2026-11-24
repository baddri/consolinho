using FleetConsole.Api.Tests.Integration;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Infrastructure;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;
using static FleetConsole.Api.Tests.Persistence.PersistenceTestData;

namespace FleetConsole.Api.Tests.Persistence;

/// <summary>
/// T-0250 (ADR-0034, GRP-1..5): user and group grants share <c>grants</c>. Group grants round-trip; the check constraint
/// and the filtered unique indexes exist and back up the aggregate's invariants; migration <c>GrantGroupSubjects</c>
/// marks pre-existing rows as user grants and, going down, removes only group grants.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class GrantSubjectPersistenceTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task GroupGrant_RoundTrips_AndIsStoredAsGroup()
    {
        var (cluster, credential) = await NewClusterWithCredentialAsync();
        var grant = NewGroupGrant(cluster, credential, "sre-emea", 50);
        await SaveAsync(sp => sp.GetRequiredService<IGrantRepository>().Add(grant));

        await using var scope = factory.Services.CreateSignedInScope();
        var loaded = await scope.ServiceProvider.GetRequiredService<IGrantRepository>().GetByIdAsync(grant.Id, Ct);

        loaded.ShouldNotBeNull();
        loaded.SubjectKind.ShouldBe(GrantSubjectKind.Group);
        loaded.UserId.ShouldBeNull();
        loaded.GroupName.ShouldBe(GroupName.Create("sre-emea").Value);
        loaded.Priority.ShouldBe(50);
        (await ScalarAsync<string>("select subject_kind from grants where id = @id", grant.Id.Value)).ShouldBe("Group");
    }

    [Fact]
    public async Task UserGrant_IsStoredAsUser()
    {
        var user = NewUser();
        var (cluster, credential) = await NewClusterWithCredentialAsync();
        var grant = NewGrant(user, cluster, credential);
        await SaveAsync(sp =>
        {
            sp.GetRequiredService<IUserRepository>().Add(user);
            sp.GetRequiredService<IGrantRepository>().Add(grant);
        });

        (await ScalarAsync<string>("select subject_kind from grants where id = @id", grant.Id.Value)).ShouldBe("User");
    }

    [Fact]
    public async Task SubjectKind_HasNoColumnDefault_LikeTheModel() =>
        (await ScalarAsync<string>(
            "select column_default from information_schema.columns where table_name = 'grants' and column_name = 'subject_kind' and @id is not null",
            Guid.NewGuid())).ShouldBeNull();

    [Fact]
    public async Task CheckConstraint_RefusesAGroupGrantWithAUser()
    {
        var user = NewUser();
        var (cluster, credential) = await NewClusterWithCredentialAsync();
        var grant = NewGrant(user, cluster, credential);
        await SaveAsync(sp =>
        {
            sp.GetRequiredService<IUserRepository>().Add(user);
            sp.GetRequiredService<IGrantRepository>().Add(grant);
        });

        var error = await Should.ThrowAsync<PostgresException>(() => ScalarAsync<int>(
            "update grants set subject_kind = 'Group', group_name = 'sre', priority = 5 where id = @id", grant.Id.Value));

        error.ConstraintName.ShouldBe("ck_grants_subject");
    }

    [Theory]
    [InlineData("ix_grants_group_name_cluster_id")]
    [InlineData("ix_grants_cluster_id_priority")]
    public async Task FilteredUniqueIndexes_Exist(string index)
    {
        var definition = await ScalarAsync<string>(
            $"select indexdef from pg_indexes where tablename = 'grants' and indexname = '{index}' and @id is not null", Guid.NewGuid());

        definition.ShouldStartWith("CREATE UNIQUE INDEX");
        definition.ShouldContain("WHERE (subject_kind = 'Group'::text)");
    }

    [Fact]
    public async Task SamePriorityOnACluster_IsADuplicateKey_ButUserGrantsDontTakePriorities()
    {
        var (cluster, credential) = await NewClusterWithCredentialAsync();
        await SaveAsync(sp => sp.GetRequiredService<IGrantRepository>().Add(NewGroupGrant(cluster, credential, "sre", 50)));

        // A racing save that the aggregate check couldn't see (it was given no slots).
        await Should.ThrowAsync<DuplicateKeyException>(() =>
            SaveAsync(sp => sp.GetRequiredService<IGrantRepository>().Add(NewGroupGrant(cluster, credential, "ops", 50))));
        await Should.ThrowAsync<DuplicateKeyException>(() =>
            SaveAsync(sp => sp.GetRequiredService<IGrantRepository>().Add(NewGroupGrant(cluster, credential, "sre", 60))));
    }

    [Fact]
    public async Task Migration_UpMarksExistingGrantsAsUser_AndDownRemovesOnlyGroupGrants()
    {
        var connectionString = factory.Postgres.ConnectionStringFor($"grant_subjects_{Guid.NewGuid():N}");
        using var host = MigrationHost(connectionString);
        await DatabaseMigrator.MigrateAsync(host.Services, Ct);

        using var scope = host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ConsoleDbContext>();
        var migrations = db.Database.GetMigrations().ToList();
        var index = migrations.FindIndex(m => m.EndsWith("_GrantGroupSubjects", StringComparison.Ordinal));
        index.ShouldBeGreaterThan(0);
        var migrator = db.GetService<IMigrator>();

        // Before Up: a CP1 user grant, which has no subject columns yet.
        await migrator.MigrateAsync(migrations[index - 1], cancellationToken: Ct);
        var userGrantId = Guid.NewGuid();
        await ExecuteWithoutForeignKeysAsync(connectionString,
            "insert into grants (id, user_id, cluster_id, credential_id, access_mode, granted_at, granted_by) " +
            $"values ('{userGrantId}', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'ReadOnly', now(), 'admin')");

        await migrator.MigrateAsync(cancellationToken: Ct);
        (await db.Database.GetPendingMigrationsAsync(Ct)).ShouldBeEmpty();
        (await ScalarAsync<string>(connectionString, "select subject_kind from grants where id = @id", userGrantId))
            .ShouldBe("User", "GRP-1: pre-existing grants become user grants");

        var groupGrantId = Guid.NewGuid();
        await ExecuteWithoutForeignKeysAsync(connectionString,
            "insert into grants (id, subject_kind, group_name, priority, cluster_id, credential_id, access_mode, granted_at, granted_by) " +
            $"values ('{groupGrantId}', 'Group', 'sre', 10, gen_random_uuid(), gen_random_uuid(), 'ReadOnly', now(), 'admin')");

        await migrator.MigrateAsync(migrations[index - 1], cancellationToken: Ct);
        (await db.Database.GetAppliedMigrationsAsync(Ct)).ShouldNotContain(migrations[index]);
        (await ScalarAsync<long>(connectionString, "select count(*) from grants where id = @id", userGrantId)).ShouldBe(1);
        (await ScalarAsync<long>(connectionString, "select count(*) from grants where id = @id", groupGrantId)).ShouldBe(0);

        await migrator.MigrateAsync(cancellationToken: Ct);
        (await db.Database.GetPendingMigrationsAsync(Ct)).ShouldBeEmpty();
    }

    /// <summary>
    /// Inserts a raw row with foreign-key triggers off (<c>session_replication_role = replica</c>, this session only), so a
    /// migration test can seed a grant without the users, clusters and credentials it would reference.
    /// </summary>
    private static async Task ExecuteWithoutForeignKeysAsync(string connectionString, string sql)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand($"set session_replication_role = replica; {sql};", connection);
        await command.ExecuteNonQueryAsync(Ct);
    }

    private static Grant NewGroupGrant(Cluster cluster, Credential credential, string group, int priority) =>
        Grant.CreateForGroup(GroupName.Create(group).Value, cluster, credential, AccessMode.ReadOnly, priority, [], Admin, Now).Value;

    private async Task<(Cluster Cluster, Credential Credential)> NewClusterWithCredentialAsync()
    {
        var cluster = NewCluster();
        Credential credential = null!;
        await SaveAsync(sp =>
        {
            sp.GetRequiredService<IClusterRepository>().Add(cluster);
            credential = NewCredential(cluster, sp.GetRequiredService<ITokenProtector>());
            sp.GetRequiredService<ICredentialRepository>().Add(credential);
        });
        return (cluster, credential);
    }

    private async Task SaveAsync(Action<IServiceProvider> stage)
    {
        await using var scope = factory.Services.CreateSignedInScope();
        stage(scope.ServiceProvider);
        await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
    }

    private Task<T> ScalarAsync<T>(string sql, Guid id) => ScalarAsync<T>(factory.ConnectionString, sql, id);

    private static async Task<T> ScalarAsync<T>(string connectionString, string sql, Guid id)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        var result = await command.ExecuteScalarAsync(Ct);
        return result is null or DBNull ? default! : (T)result;
    }

    /// <summary>A Production host that is never started, as in <see cref="DatabaseMigratorTests"/>.</summary>
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
}
