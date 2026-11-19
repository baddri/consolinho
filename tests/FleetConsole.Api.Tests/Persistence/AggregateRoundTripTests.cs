using System.Text.Json.Nodes;
using FleetConsole.Api.Tests.Integration;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using static FleetConsole.Api.Tests.Persistence.PersistenceTestData;

namespace FleetConsole.Api.Tests.Persistence;

/// <summary>
/// Every CP1 aggregate survives a save and a load in a fresh unit of work with all its value objects intact, and gets
/// its <c>Version</c> from <c>xmin</c>. Uses the real composition (repositories, <see cref="IUnitOfWork"/>, read model)
/// against the shared test database.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class AggregateRoundTripTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task User_RoundTrips_WithGroupsAndAdminSources()
    {
        var user = NewUser(UserRole.Admin, isReadOnly: true);
        user.RecordLogin("Alice Example", ["sre", "fleetconsole-admins", "system:authenticated"], "group fleetconsole-admins", provisioned: false, Now.AddMinutes(5))
            .IsSuccess.ShouldBeTrue();
        await SaveAsync(sp => sp.GetRequiredService<IUserRepository>().Add(user));

        var loaded = await LoadAsync(sp => sp.GetRequiredService<IUserRepository>().GetByUsernameAsync(user.Username, Ct));

        loaded.ShouldNotBeNull();
        loaded.Id.ShouldBe(user.Id);
        loaded.Username.ShouldBe(user.Username);
        loaded.DisplayName.ShouldBe("Alice Example");
        loaded.IsAdminByAssignment.ShouldBeTrue();
        loaded.AdminConfigurationSource.ShouldBe("group fleetconsole-admins");
        loaded.Role.ShouldBe(UserRole.Admin);
        loaded.IsReadOnly.ShouldBeTrue();
        loaded.IsDeactivated.ShouldBeFalse();
        loaded.Status.ShouldBe(UserStatus.Active);
        loaded.LastLoginAt.ShouldBe(Now.AddMinutes(5));
        loaded.Groups.ShouldBe(["sre", "fleetconsole-admins", "system:authenticated"]);
        loaded.SecurityStamp.ShouldBe(user.SecurityStamp);
        loaded.CreatedAt.ShouldBe(Now);
        loaded.CreatedBy.ShouldBe(Admin);
        loaded.Version.ShouldNotBe(0u);
        loaded.Version.ShouldBe(user.Version, "the save reads the new xmin back into the tracked aggregate");
    }

    [Fact]
    public async Task PendingUser_RoundTrips_WithEmptyGroups()
    {
        var user = NewUser();
        await SaveAsync(sp => sp.GetRequiredService<IUserRepository>().Add(user));

        var loaded = await LoadAsync(sp => sp.GetRequiredService<IUserRepository>().GetByIdAsync(user.Id, Ct));

        loaded.ShouldNotBeNull();
        loaded.Groups.ShouldBeEmpty();
        loaded.LastLoginAt.ShouldBeNull();
        loaded.DisplayName.ShouldBeNull();
        loaded.AdminConfigurationSource.ShouldBeNull();
        loaded.Status.ShouldBe(UserStatus.Pending);
    }

    [Fact]
    public async Task Cluster_RoundTrips_WithCaBundleAndCanonicalApiUrl()
    {
        var cluster = NewCluster(withCaBundle: true);
        await SaveAsync(sp => sp.GetRequiredService<IClusterRepository>().Add(cluster));

        var loaded = await LoadAsync(sp => sp.GetRequiredService<IClusterRepository>().GetByNameAsync(cluster.Name, Ct));

        loaded.ShouldNotBeNull();
        loaded.Id.ShouldBe(cluster.Id);
        loaded.Name.ShouldBe(cluster.Name);
        loaded.DisplayName.ShouldBe("Persistence test cluster");
        loaded.Endpoint.ShouldBe(cluster.Endpoint);
        loaded.Endpoint.ToString().ShouldBe("https://api.persistence.example.com:6443");
        loaded.Endpoint.CaBundle.ShouldNotBeNull().Pem.ShouldBe(CaBundlePem.Trim());
        loaded.Endpoint.CaBundle.Certificates.Count.ShouldBe(1);
        loaded.Endpoint.TlsMode.ShouldBe(ClusterTlsMode.CaBundle);
        loaded.Endpoint.SkipTlsVerify.ShouldBeFalse();
        loaded.Environment.ShouldBe(ClusterEnvironment.Staging);
        loaded.WebConsoleUrl.ShouldBe(new Uri("https://console.persistence.example.com/dashboards?tab=1"));
        loaded.WebConsoleUrl!.OriginalString.ShouldBe("https://console.persistence.example.com/dashboards?tab=1");
        loaded.Description.ShouldBe("Used by persistence tests");
        loaded.IsEnabled.ShouldBeFalse();
        loaded.ConnectionSettingsChangedAt.ShouldBe(Now);
        loaded.CreatedAt.ShouldBe(Now);
        loaded.CreatedBy.ShouldBe(Admin);
        loaded.UpdatedAt.ShouldBeNull();
        loaded.UpdatedBy.ShouldBeNull();
        loaded.Version.ShouldNotBe(0u);

        // The column holds the canonical text (no trailing '/'), which is what the API returns and audit records.
        (await ScalarAsync<string>("select api_url from clusters where id = @id", cluster.Id.Value))
            .ShouldBe("https://api.persistence.example.com:6443");
    }

    [Fact]
    public async Task Cluster_WithSkipTlsAndNoOptionalValues_RoundTrips()
    {
        var cluster = Cluster.Register(
            NewClusterName(), displayName: null,
            ApiServerEndpoint.Create("https://api.skip.example.com", caBundlePem: null, skipTlsVerify: true).Value,
            ClusterEnvironment.Development, webConsoleUrl: null, description: null, isEnabled: true, Admin, Now);
        await SaveAsync(sp => sp.GetRequiredService<IClusterRepository>().Add(cluster));

        var loaded = await LoadAsync(sp => sp.GetRequiredService<IClusterRepository>().GetByIdAsync(cluster.Id, Ct));

        loaded.ShouldNotBeNull();
        loaded.DisplayName.ShouldBe(cluster.Name.Value);
        loaded.Endpoint.CaBundle.ShouldBeNull();
        loaded.Endpoint.SkipTlsVerify.ShouldBeTrue();
        loaded.Endpoint.TlsMode.ShouldBe(ClusterTlsMode.SkipVerify);
        loaded.Endpoint.ToString().ShouldBe("https://api.skip.example.com");
        loaded.WebConsoleUrl.ShouldBeNull();
        loaded.Description.ShouldBeNull();
        loaded.IsEnabled.ShouldBeTrue();
    }

    [Fact]
    public async Task Credential_RoundTrips_WithMetadataAndLastTest()
    {
        var cluster = NewCluster();
        Credential credential = null!;
        await SaveAsync(sp =>
        {
            sp.GetRequiredService<IClusterRepository>().Add(cluster);
            credential = NewCredential(cluster, sp.GetRequiredService<ITokenProtector>());
            credential.RecordTest(
                new ConnectionTestSummary(Now.AddMinutes(1), Succeeded: false, ConnectionTestStep.OpenShiftVersion, CapabilityLevel.ClusterWideView),
                cluster.Name.Value);
            sp.GetRequiredService<ICredentialRepository>().Add(credential);
        });

        var loaded = await LoadAsync(sp => sp.GetRequiredService<ICredentialRepository>().GetByIdAsync(credential.Id, Ct));

        loaded.ShouldNotBeNull();
        loaded.ClusterId.ShouldBe(cluster.Id);
        loaded.Name.ShouldBe(credential.Name);
        loaded.Description.ShouldBe("Fake SA token for tests");
        loaded.Token.ShouldBe(credential.Token);
        loaded.Fingerprint.ShouldBe(credential.Fingerprint);
        loaded.Metadata.ShouldBe(credential.Metadata);
        loaded.Metadata.ServiceAccount.ShouldBe("fleet/viewer");
        loaded.LastTest.ShouldBe(new ConnectionTestSummary(Now.AddMinutes(1), false, ConnectionTestStep.OpenShiftVersion, CapabilityLevel.ClusterWideView));
        loaded.CreatedAt.ShouldBe(Now);
        loaded.CreatedBy.ShouldBe(Admin);
        loaded.RotatedAt.ShouldBeNull();
        loaded.Version.ShouldNotBe(0u);
    }

    [Fact]
    public async Task Credential_WithOpaqueTokenAndNoTest_RoundTripsLastTestAsNull()
    {
        var cluster = NewCluster();
        Credential credential = null!;
        await SaveAsync(sp =>
        {
            sp.GetRequiredService<IClusterRepository>().Add(cluster);
            credential = Credential.Add(
                cluster, CredentialName.Create("opaque").Value, null,
                sp.GetRequiredService<ITokenProtector>().Protect(new SensitiveString(FakeToken())),
                TokenFingerprint.Create("ffff0000").Value, TokenMetadata.Opaque, Admin, Now);
            sp.GetRequiredService<ICredentialRepository>().Add(credential);
        });

        var loaded = await LoadAsync(sp => sp.GetRequiredService<ICredentialRepository>().GetByIdAsync(credential.Id, Ct));

        loaded.ShouldNotBeNull();
        loaded.LastTest.ShouldBeNull();
        loaded.Metadata.ShouldBe(TokenMetadata.Opaque);
        loaded.Description.ShouldBeNull();
    }

    [Fact]
    public async Task Grant_RoundTrips()
    {
        var user = NewUser();
        var cluster = NewCluster();
        Grant grant = null!;
        await SaveAsync(sp =>
        {
            sp.GetRequiredService<IUserRepository>().Add(user);
            sp.GetRequiredService<IClusterRepository>().Add(cluster);
            var credential = NewCredential(cluster, sp.GetRequiredService<ITokenProtector>());
            sp.GetRequiredService<ICredentialRepository>().Add(credential);
            grant = NewGrant(user, cluster, credential, AccessMode.ReadWrite);
            sp.GetRequiredService<IGrantRepository>().Add(grant);
        });

        var loaded = await LoadAsync(sp => sp.GetRequiredService<IGrantRepository>().GetByIdAsync(grant.Id, Ct));

        loaded.ShouldNotBeNull();
        loaded.UserId.ShouldBe(user.Id);
        loaded.ClusterId.ShouldBe(cluster.Id);
        loaded.CredentialId.ShouldBe(grant.CredentialId);
        loaded.AccessMode.ShouldBe(AccessMode.ReadWrite);
        loaded.GrantedAt.ShouldBe(Now);
        loaded.GrantedBy.ShouldBe(Admin);
        loaded.UpdatedAt.ShouldBeNull();
        loaded.Version.ShouldNotBe(0u);
        (await ScalarAsync<string>("select access_mode from grants where id = @id", grant.Id.Value)).ShouldBe("ReadWrite");
    }

    [Fact]
    public async Task AuditEntry_RoundTrips_WithActorAndJsonDetails()
    {
        var actorId = UserId.New();
        var entry = AuditEntry.Record(
            AuditActor.ForUser(actorId, "alice"), "grant.created", AuditTargetType.Grant, Guid.NewGuid().ToString(),
            "alice → prod-eu-1", "prod-eu-1", "Granted alice ReadOnly on prod-eu-1 via fleet-view",
            "4bf92f3577b34da6a3ce929d0e0e4736", """{"username":"alice","accessMode":"readOnly","credential":"fleet-view"}""", Now,
            relatedUsername: "alice");
        var system = AuditEntry.Record(
            AuditActor.Configuration, "user.promoted", AuditTargetType.User, null, "bob", null, "Promoted bob", null, "{}", Now);
        await SaveAsync(sp =>
        {
            var repository = sp.GetRequiredService<IAuditEntryRepository>();
            repository.Add(entry);
            repository.Add(system);
        });

        await using var scope = factory.Services.CreateSignedInScope();
        var readModel = scope.ServiceProvider.GetRequiredService<IReadModel>();
        var loaded = await readModel.FirstOrDefaultAsync(readModel.AuditEntries.Where(a => a.Id == entry.Id), Ct);
        var loadedSystem = await readModel.FirstOrDefaultAsync(readModel.AuditEntries.Where(a => a.Id == system.Id), Ct);

        loaded.ShouldNotBeNull();
        loaded.Actor.ShouldBe(AuditActor.ForUser(actorId, "alice"));
        loaded.Action.ShouldBe("grant.created");
        loaded.Category.ShouldBe(AuditCategory.Grants);
        loaded.TargetType.ShouldBe(AuditTargetType.Grant);
        loaded.TargetId.ShouldBe(entry.TargetId);
        loaded.TargetName.ShouldBe("alice → prod-eu-1");
        loaded.ClusterName.ShouldBe("prod-eu-1");
        loaded.RelatedUsername.ShouldBe("alice");
        loaded.Summary.ShouldBe(entry.Summary);
        loaded.CorrelationId.ShouldBe("4bf92f3577b34da6a3ce929d0e0e4736");
        JsonNode.DeepEquals(JsonNode.Parse(loaded.DetailsJson), JsonNode.Parse(entry.DetailsJson)).ShouldBeTrue();
        loaded.OccurredAt.ShouldBe(Now);
        loaded.Version.ShouldNotBe(0u);

        loadedSystem.ShouldNotBeNull();
        loadedSystem.Actor.ShouldBe(AuditActor.Configuration);
        loadedSystem.TargetId.ShouldBeNull();
        loadedSystem.CorrelationId.ShouldBeNull();
        loadedSystem.RelatedUsername.ShouldBeNull();

        (await ScalarAsync<string>("select pg_typeof(details)::text from audit_entries where id = @id", entry.Id.Value)).ShouldBe("jsonb");
    }

    [Fact]
    public async Task Version_ChangesOnEveryWrite()
    {
        var cluster = NewCluster();
        await SaveAsync(sp => sp.GetRequiredService<IClusterRepository>().Add(cluster));
        var created = cluster.Version;

        await using (var scope = factory.Services.CreateSignedInScope())
        {
            var loaded = (await scope.ServiceProvider.GetRequiredService<IClusterRepository>().GetByIdAsync(cluster.Id, Ct))!;
            loaded.Version.ShouldBe(created);
            loaded.Enable(Admin, Now.AddMinutes(1));
            await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
            loaded.Version.ShouldNotBe(created);
        }

        var reloaded = await LoadAsync(sp => sp.GetRequiredService<IClusterRepository>().GetByIdAsync(cluster.Id, Ct));
        reloaded!.Version.ShouldNotBe(created);
        reloaded.IsEnabled.ShouldBeTrue();
        reloaded.UpdatedAt.ShouldBe(Now.AddMinutes(1));
        reloaded.UpdatedBy.ShouldBe(Admin);
    }

    private async Task SaveAsync(Action<IServiceProvider> stage)
    {
        await using var scope = factory.Services.CreateSignedInScope();
        stage(scope.ServiceProvider);
        await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
    }

    private async Task<T> LoadAsync<T>(Func<IServiceProvider, Task<T>> load)
    {
        await using var scope = factory.Services.CreateSignedInScope();
        var result = await load(scope.ServiceProvider);
        // Sanity check that the load really went to the database: the fresh scope tracked exactly what it loaded.
        scope.ServiceProvider.GetRequiredService<ConsoleDbContext>().ChangeTracker.Entries().Count().ShouldBeLessThanOrEqualTo(1);
        return result;
    }

    private async Task<T> ScalarAsync<T>(string sql, Guid id)
    {
        await using var connection = new NpgsqlConnection(factory.ConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        return (T)(await command.ExecuteScalarAsync(Ct))!;
    }
}
