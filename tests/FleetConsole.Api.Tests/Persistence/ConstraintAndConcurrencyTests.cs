using FleetConsole.Api.Tests.Integration;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using static FleetConsole.Api.Tests.Persistence.PersistenceTestData;

namespace FleetConsole.Api.Tests.Persistence;

/// <summary>
/// Database-enforced rules: unique natural keys surface as <see cref="DuplicateKeyException"/>, stale <c>xmin</c> as
/// <see cref="ConcurrencyConflictException"/> (both through <see cref="IUnitOfWork"/>), and the CP1 foreign keys
/// (cluster deletion cascades, credentials in use can't be deleted, users can't be deleted).
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ConstraintAndConcurrencyTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task DuplicateUsername_RaisesDuplicateKeyException()
    {
        var username = NewUsername();
        await SaveAsync(sp => sp.GetRequiredService<IUserRepository>().Add(NewUser(username: username)));

        var exception = await Should.ThrowAsync<DuplicateKeyException>(
            () => SaveAsync(sp => sp.GetRequiredService<IUserRepository>().Add(NewUser(username: username))));

        exception.ConstraintName.ShouldBe("ix_users_username");
        exception.Message.ShouldNotContain(username.Value);
    }

    [Fact]
    public async Task DuplicateClusterName_RaisesDuplicateKeyException()
    {
        var name = NewClusterName();
        await SaveAsync(sp => sp.GetRequiredService<IClusterRepository>().Add(NewCluster(name: name)));

        var exception = await Should.ThrowAsync<DuplicateKeyException>(
            () => SaveAsync(sp => sp.GetRequiredService<IClusterRepository>().Add(NewCluster(name: name))));

        exception.ConstraintName.ShouldBe("ix_clusters_name");
    }

    [Fact]
    public async Task DuplicateCredentialNameWithinCluster_RaisesDuplicateKeyException_ButOtherClustersMayReuseIt()
    {
        var cluster = NewCluster();
        var other = NewCluster();
        var name = CredentialName.Create("fleet-view").Value;
        await SaveAsync(sp =>
        {
            sp.GetRequiredService<IClusterRepository>().Add(cluster);
            sp.GetRequiredService<IClusterRepository>().Add(other);
            sp.GetRequiredService<ICredentialRepository>().Add(NewCredential(cluster, sp.GetRequiredService<ITokenProtector>(), name: name));
            sp.GetRequiredService<ICredentialRepository>().Add(NewCredential(other, sp.GetRequiredService<ITokenProtector>(), name: name));
        });

        var exception = await Should.ThrowAsync<DuplicateKeyException>(() => SaveAsync(sp =>
            sp.GetRequiredService<ICredentialRepository>().Add(NewCredential(cluster, sp.GetRequiredService<ITokenProtector>(), name: name))));

        exception.ConstraintName.ShouldBe("ix_credentials_cluster_id_name");
    }

    [Fact]
    public async Task SecondGrantForSameUserAndCluster_RaisesDuplicateKeyException()
    {
        var user = NewUser();
        var cluster = NewCluster();
        Credential credential = null!;
        await SaveAsync(sp =>
        {
            sp.GetRequiredService<IUserRepository>().Add(user);
            sp.GetRequiredService<IClusterRepository>().Add(cluster);
            credential = NewCredential(cluster, sp.GetRequiredService<ITokenProtector>());
            sp.GetRequiredService<ICredentialRepository>().Add(credential);
            sp.GetRequiredService<IGrantRepository>().Add(NewGrant(user, cluster, credential));
        });

        // The race the aggregate's check can't see: the second command read "no grant yet" before the first committed.
        var exception = await Should.ThrowAsync<DuplicateKeyException>(() => SaveAsync(sp =>
            sp.GetRequiredService<IGrantRepository>().Add(NewGrant(user, cluster, credential, AccessMode.ReadWrite))));

        exception.ConstraintName.ShouldBe("ix_grants_user_id_cluster_id");
    }

    [Fact]
    public async Task UpdateWithStaleXmin_RaisesConcurrencyConflictException()
    {
        var user = NewUser();
        await SaveAsync(sp => sp.GetRequiredService<IUserRepository>().Add(user));

        await using var first = factory.Services.CreateAsyncScope();
        await using var second = factory.Services.CreateAsyncScope();
        var firstCopy = (await first.ServiceProvider.GetRequiredService<IUserRepository>().GetByIdAsync(user.Id, Ct))!;
        var secondCopy = (await second.ServiceProvider.GetRequiredService<IUserRepository>().GetByIdAsync(user.Id, Ct))!;

        firstCopy.SetReadOnly(true, activeWritableAdminCount: 5).IsSuccess.ShouldBeTrue();
        await first.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);

        secondCopy.Deactivate(UserId.New(), activeWritableAdminCount: 5).IsSuccess.ShouldBeTrue();
        await Should.ThrowAsync<ConcurrencyConflictException>(
            () => second.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct));

        var stored = await LoadAsync(sp => sp.GetRequiredService<IUserRepository>().GetByIdAsync(user.Id, Ct));
        stored!.IsReadOnly.ShouldBeTrue();
        stored.IsDeactivated.ShouldBeFalse("the stale write must not be applied");
    }

    [Fact]
    public async Task DeleteWithStaleXmin_RaisesConcurrencyConflictException()
    {
        var cluster = NewCluster();
        await SaveAsync(sp => sp.GetRequiredService<IClusterRepository>().Add(cluster));

        await using var first = factory.Services.CreateAsyncScope();
        await using var second = factory.Services.CreateAsyncScope();
        var editing = (await first.ServiceProvider.GetRequiredService<IClusterRepository>().GetByIdAsync(cluster.Id, Ct))!;
        var deleting = (await second.ServiceProvider.GetRequiredService<IClusterRepository>().GetByIdAsync(cluster.Id, Ct))!;

        editing.Enable(Admin, Now);
        await first.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);

        second.ServiceProvider.GetRequiredService<IClusterRepository>().Remove(deleting);
        await Should.ThrowAsync<ConcurrencyConflictException>(
            () => second.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct));

        (await LoadAsync(sp => sp.GetRequiredService<IClusterRepository>().GetByIdAsync(cluster.Id, Ct))).ShouldNotBeNull();
    }

    [Fact]
    public async Task DeletingCluster_CascadesToItsCredentialsAndGrants_AndKeepsUsers()
    {
        // CLU-6: one DELETE on clusters removes both children. Grants→credentials is NO ACTION (checked at statement end),
        // so the cascade order inside the statement doesn't matter.
        var alice = NewUser();
        var bob = NewUser();
        var cluster = NewCluster();
        var survivor = NewCluster();
        Credential survivingCredential = null!;
        await SaveAsync(sp =>
        {
            var protector = sp.GetRequiredService<ITokenProtector>();
            sp.GetRequiredService<IUserRepository>().Add(alice);
            sp.GetRequiredService<IUserRepository>().Add(bob);
            sp.GetRequiredService<IClusterRepository>().Add(cluster);
            sp.GetRequiredService<IClusterRepository>().Add(survivor);
            var view = NewCredential(cluster, protector);
            var edit = NewCredential(cluster, protector);
            survivingCredential = NewCredential(survivor, protector);
            sp.GetRequiredService<ICredentialRepository>().Add(view);
            sp.GetRequiredService<ICredentialRepository>().Add(edit);
            sp.GetRequiredService<ICredentialRepository>().Add(survivingCredential);
            sp.GetRequiredService<IGrantRepository>().Add(NewGrant(alice, cluster, view));
            sp.GetRequiredService<IGrantRepository>().Add(NewGrant(bob, cluster, edit, AccessMode.ReadWrite));
            sp.GetRequiredService<IGrantRepository>().Add(NewGrant(alice, survivor, survivingCredential));
        });

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var sp = scope.ServiceProvider;
            var loaded = (await sp.GetRequiredService<IClusterRepository>().GetByIdAsync(cluster.Id, Ct))!;
            var credentialCount = await sp.GetRequiredService<ICredentialRepository>().CountByClusterAsync(cluster.Id, Ct);
            var grantCount = await sp.GetRequiredService<IGrantRepository>().CountByClusterAsync(cluster.Id, Ct);
            credentialCount.ShouldBe(2);
            grantCount.ShouldBe(2);

            loaded.MarkForDeletion(credentialCount, grantCount).IsSuccess.ShouldBeTrue();
            sp.GetRequiredService<IClusterRepository>().Remove(loaded);
            await sp.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
        }

        (await CountAsync("select count(*) from clusters where id = @id", cluster.Id.Value)).ShouldBe(0);
        (await CountAsync("select count(*) from credentials where cluster_id = @id", cluster.Id.Value)).ShouldBe(0);
        (await CountAsync("select count(*) from grants where cluster_id = @id", cluster.Id.Value)).ShouldBe(0);
        (await CountAsync("select count(*) from users where id = @id", alice.Id.Value)).ShouldBe(1);
        (await CountAsync("select count(*) from users where id = @id", bob.Id.Value)).ShouldBe(1);
        (await CountAsync("select count(*) from credentials where cluster_id = @id", survivor.Id.Value)).ShouldBe(1);
        (await CountAsync("select count(*) from grants where cluster_id = @id", survivor.Id.Value)).ShouldBe(1);
    }

    [Fact]
    public async Task DeletingCredentialStillUsedByAGrant_Fails()
    {
        // CRED-6 backstop: the handler refuses first (MarkForDeletion with the grant count); the foreign key refuses too.
        var user = NewUser();
        var cluster = NewCluster();
        Credential credential = null!;
        await SaveAsync(sp =>
        {
            sp.GetRequiredService<IUserRepository>().Add(user);
            sp.GetRequiredService<IClusterRepository>().Add(cluster);
            credential = NewCredential(cluster, sp.GetRequiredService<ITokenProtector>());
            sp.GetRequiredService<ICredentialRepository>().Add(credential);
            sp.GetRequiredService<IGrantRepository>().Add(NewGrant(user, cluster, credential));
        });

        await using var scope = factory.Services.CreateAsyncScope();
        var repository = scope.ServiceProvider.GetRequiredService<ICredentialRepository>();
        repository.Remove((await repository.GetByIdAsync(credential.Id, Ct))!);

        var exception = await Should.ThrowAsync<DbUpdateException>(
            () => scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct));

        exception.InnerException.ShouldBeOfType<PostgresException>().SqlState.ShouldBe(PostgresErrorCodes.ForeignKeyViolation);
        (await CountAsync("select count(*) from credentials where id = @id", credential.Id.Value)).ShouldBe(1);
    }

    [Fact]
    public async Task DeletingUserWithGrants_IsRestricted()
    {
        // Users are never deleted by the application; the RESTRICT foreign key guards against it at the database level.
        var user = NewUser();
        var cluster = NewCluster();
        await SaveAsync(sp =>
        {
            sp.GetRequiredService<IUserRepository>().Add(user);
            sp.GetRequiredService<IClusterRepository>().Add(cluster);
            var credential = NewCredential(cluster, sp.GetRequiredService<ITokenProtector>());
            sp.GetRequiredService<ICredentialRepository>().Add(credential);
            sp.GetRequiredService<IGrantRepository>().Add(NewGrant(user, cluster, credential));
        });

        await using var connection = new NpgsqlConnection(factory.ConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand("delete from users where id = @id", connection);
        command.Parameters.AddWithValue("id", user.Id.Value);

        var exception = await Should.ThrowAsync<PostgresException>(() => command.ExecuteNonQueryAsync(Ct));

        // RESTRICT (unlike NO ACTION, which reports 23503 at statement end) fails immediately with restrict_violation.
        exception.SqlState.ShouldBe(PostgresErrorCodes.RestrictViolation);
    }

    private async Task SaveAsync(Action<IServiceProvider> stage)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        stage(scope.ServiceProvider);
        await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
    }

    private async Task<T> LoadAsync<T>(Func<IServiceProvider, Task<T>> load)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await load(scope.ServiceProvider);
    }

    private async Task<long> CountAsync(string sql, Guid id)
    {
        await using var connection = new NpgsqlConnection(factory.ConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        return (long)(await command.ExecuteScalarAsync(Ct))!;
    }
}
