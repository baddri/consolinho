using FleetConsole.Api.Tests.Integration;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Common;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using static FleetConsole.Api.Tests.Persistence.PersistenceTestData;

namespace FleetConsole.Api.Tests.Persistence;

/// <summary>
/// The facts repositories compute in SQL for aggregate rules (last admin, existing grants, usage counts), the bulk
/// lookups, and the read model's no-tracking queries and async operators.
/// </summary>
/// <remarks>
/// The database is shared with other integration tests (run sequentially within the collection), so global counts are
/// asserted as deltas.
/// </remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class RepositoryAndReadModelTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task CountActiveWritableAdmins_CountsAssignedAndConfigurationAdmins_ButNotReadOnlyDeactivatedOrRegularUsers()
    {
        var before = await InScopeAsync(sp => sp.GetRequiredService<IUserRepository>().CountActiveWritableAdminsAsync(Ct));

        var assigned = NewUser(UserRole.Admin);
        var configured = NewUser();
        configured.RecordLogin(null, ["fleetconsole-admins"], "group fleetconsole-admins", provisioned: false, Now).IsSuccess.ShouldBeTrue();
        var bootstrap = NewUser();
        bootstrap.RecordLogin(null, [], "user list", provisioned: false, Now).IsSuccess.ShouldBeTrue();
        var readOnlyAdmin = NewUser(UserRole.Admin, isReadOnly: true);
        var readOnlyConfigured = NewUser(isReadOnly: true);
        readOnlyConfigured.RecordLogin(null, [], "user list", provisioned: false, Now).IsSuccess.ShouldBeTrue();
        var deactivatedAdmin = NewUser(UserRole.Admin);
        deactivatedAdmin.Deactivate(UserId.New(), activeWritableAdminCount: 10).IsSuccess.ShouldBeTrue();
        var regular = NewUser();
        User[] users = [assigned, configured, bootstrap, readOnlyAdmin, readOnlyConfigured, deactivatedAdmin, regular];
        users.Count(u => u.IsActiveWritableAdmin).ShouldBe(3, "test data sanity check against the Domain rule");

        await InScopeAsync(async sp =>
        {
            foreach (var user in users)
            {
                sp.GetRequiredService<IUserRepository>().Add(user);
            }

            await sp.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
            return 0;
        });

        var after = await InScopeAsync(sp => sp.GetRequiredService<IUserRepository>().CountActiveWritableAdminsAsync(Ct));
        after.ShouldBe(before + 3);
    }

    [Fact]
    public async Task UserLookups_MatchUsernameExactly()
    {
        var user = NewUser();
        await SaveAsync(sp => sp.GetRequiredService<IUserRepository>().Add(user));
        var upper = Username.Create(user.Username.Value.ToUpperInvariant()).Value;

        await InScopeAsync(async sp =>
        {
            var repository = sp.GetRequiredService<IUserRepository>();
            (await repository.ExistsAsync(user.Username, Ct)).ShouldBeTrue();
            (await repository.ExistsAsync(upper, Ct)).ShouldBeFalse();
            (await repository.GetByUsernameAsync(upper, Ct)).ShouldBeNull();
            (await repository.GetByIdAsync(UserId.New(), Ct)).ShouldBeNull();
            return 0;
        });
    }

    [Fact]
    public async Task ClusterLookups_ByNameAndNames()
    {
        var first = NewCluster();
        var second = NewCluster();
        await SaveAsync(sp =>
        {
            sp.GetRequiredService<IClusterRepository>().Add(first);
            sp.GetRequiredService<IClusterRepository>().Add(second);
        });

        await InScopeAsync(async sp =>
        {
            var repository = sp.GetRequiredService<IClusterRepository>();
            (await repository.ExistsAsync(first.Name, Ct)).ShouldBeTrue();
            (await repository.ExistsAsync(NewClusterName(), Ct)).ShouldBeFalse();

            var found = await repository.GetByNamesAsync([first.Name, second.Name, NewClusterName()], Ct);
            found.Select(c => c.Id).ShouldBe([first.Id, second.Id], ignoreOrder: true);
            (await repository.GetByNamesAsync([], Ct)).ShouldBeEmpty();
            return 0;
        });
    }

    [Fact]
    public async Task CredentialAndGrantFacts_AreComputedPerClusterUserAndCredential()
    {
        var user = NewUser();
        var otherUser = NewUser();
        var cluster = NewCluster();
        var otherCluster = NewCluster();
        Credential used = null!;
        Credential unused = null!;
        Credential elsewhere = null!;
        await SaveAsync(sp =>
        {
            var protector = sp.GetRequiredService<ITokenProtector>();
            sp.GetRequiredService<IUserRepository>().Add(user);
            sp.GetRequiredService<IUserRepository>().Add(otherUser);
            sp.GetRequiredService<IClusterRepository>().Add(cluster);
            sp.GetRequiredService<IClusterRepository>().Add(otherCluster);
            used = NewCredential(cluster, protector);
            unused = NewCredential(cluster, protector);
            elsewhere = NewCredential(otherCluster, protector);
            var credentials = sp.GetRequiredService<ICredentialRepository>();
            credentials.Add(used);
            credentials.Add(unused);
            credentials.Add(elsewhere);
            var grants = sp.GetRequiredService<IGrantRepository>();
            grants.Add(NewGrant(user, cluster, used));
            grants.Add(NewGrant(otherUser, cluster, used));
            grants.Add(NewGrant(user, otherCluster, elsewhere));
        });

        await InScopeAsync(async sp =>
        {
            var credentials = sp.GetRequiredService<ICredentialRepository>();
            (await credentials.NameExistsAsync(cluster.Id, used.Name, Ct)).ShouldBeTrue();
            (await credentials.NameExistsAsync(otherCluster.Id, used.Name, Ct)).ShouldBeFalse();
            (await credentials.CountByClusterAsync(cluster.Id, Ct)).ShouldBe(2);
            var byIds = await credentials.GetByIdsAsync([used.Id, elsewhere.Id, CredentialId.New()], Ct);
            byIds.Select(c => c.Id).ShouldBe([used.Id, elsewhere.Id], ignoreOrder: true);
            (await credentials.GetByIdsAsync([], Ct)).ShouldBeEmpty();

            var grants = sp.GetRequiredService<IGrantRepository>();
            (await grants.GetClusterIdsForUserAsync(user.Id, Ct)).ShouldBe(new HashSet<ClusterId> { cluster.Id, otherCluster.Id }, ignoreOrder: true);
            (await grants.GetClusterIdsForUserAsync(UserId.New(), Ct)).ShouldBeEmpty();
            (await grants.CountByCredentialAsync(used.Id, Ct)).ShouldBe(2);
            (await grants.CountByCredentialAsync(unused.Id, Ct)).ShouldBe(0);
            (await grants.CountByClusterAsync(cluster.Id, Ct)).ShouldBe(2);
            return 0;
        });
    }

    [Fact]
    public async Task ReadModel_IsNoTracking_AndExecutesProjectionsInSql()
    {
        var admin = NewUser(UserRole.Admin);
        var configured = NewUser();
        configured.RecordLogin("Config Admin", ["admins"], "group admins", provisioned: false, Now).IsSuccess.ShouldBeTrue();
        var regular = NewUser();
        await SaveAsync(sp =>
        {
            sp.GetRequiredService<IUserRepository>().Add(admin);
            sp.GetRequiredService<IUserRepository>().Add(configured);
            sp.GetRequiredService<IUserRepository>().Add(regular);
        });
        Username[] names = [admin.Username, configured.Username, regular.Username];

        await InScopeAsync(async sp =>
        {
            var readModel = sp.GetRequiredService<IReadModel>();

            // The role is derived, so the projection spells out the rule over mapped columns (ADR-0009).
            var rows = await readModel.ToListAsync(
                readModel.Users
                    .Where(u => names.Contains(u.Username))
                    .OrderBy(u => u.CreatedAt).ThenBy(u => u.Id)
                    .Select(u => new { u.Id, u.Username, IsAdmin = u.IsAdminByAssignment || u.AdminConfigurationSource != null, u.Version }),
                Ct);
            rows.Count.ShouldBe(3);
            rows.Single(r => r.Id == admin.Id).IsAdmin.ShouldBeTrue();
            rows.Single(r => r.Id == configured.Id).IsAdmin.ShouldBeTrue();
            rows.Single(r => r.Id == regular.Id).IsAdmin.ShouldBeFalse();
            rows.ShouldAllBe(r => r.Version != 0u);

            (await readModel.CountAsync(readModel.Users.Where(u => names.Contains(u.Username)), Ct)).ShouldBe(3);
            (await readModel.AnyAsync(readModel.Users.Where(u => u.Username == regular.Username), Ct)).ShouldBeTrue();
            (await readModel.AnyAsync(readModel.Users.Where(u => u.Username == NewUsername()), Ct)).ShouldBeFalse();
            var entity = await readModel.FirstOrDefaultAsync(readModel.Users.Where(u => u.Id == configured.Id), Ct);
            entity.ShouldNotBeNull().Groups.ShouldBe(["admins"]);
            (await readModel.FirstOrDefaultAsync(readModel.Users.Where(u => u.Id == UserId.New()), Ct)).ShouldBeNull();

            sp.GetRequiredService<ConsoleDbContext>().ChangeTracker.Entries().ShouldBeEmpty();
            return 0;
        });
    }

    [Fact]
    public async Task ReadModel_JoinsAggregatesById()
    {
        var user = NewUser();
        var cluster = NewCluster();
        await SaveAsync(sp =>
        {
            sp.GetRequiredService<IUserRepository>().Add(user);
            sp.GetRequiredService<IClusterRepository>().Add(cluster);
            var credential = NewCredential(cluster, sp.GetRequiredService<ITokenProtector>());
            credential.RecordTest(new ConnectionTestSummary(Now.AddMinutes(-5), true, null, CapabilityLevel.Limited), cluster.Name.Value);
            sp.GetRequiredService<ICredentialRepository>().Add(credential);
            sp.GetRequiredService<IGrantRepository>().Add(NewGrant(user, cluster, credential));
        });

        await InScopeAsync(async sp =>
        {
            var readModel = sp.GetRequiredService<IReadModel>();
            var query =
                from g in readModel.Grants
                join c in readModel.Clusters on g.ClusterId equals c.Id
                join cr in readModel.Credentials on g.CredentialId equals cr.Id
                where g.UserId == user.Id
                select new { ClusterName = c.Name, CredentialName = cr.Name, cr.LastTest, c.ConnectionSettingsChangedAt };

            var row = (await readModel.ToListAsync(query, Ct)).ShouldHaveSingleItem();

            row.ClusterName.ShouldBe(cluster.Name);
            row.LastTest.ShouldNotBeNull().Headline.ShouldBe(CapabilityLevel.Limited);
            ConnectionTestSummaryMapping.ToDto(row.LastTest, row.ConnectionSettingsChangedAt)!.IsStale.ShouldBeTrue();
            return 0;
        });
    }

    private async Task SaveAsync(Action<IServiceProvider> stage)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        stage(scope.ServiceProvider);
        await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
    }

    private async Task<T> InScopeAsync<T>(Func<IServiceProvider, Task<T>> action)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider);
    }
}
