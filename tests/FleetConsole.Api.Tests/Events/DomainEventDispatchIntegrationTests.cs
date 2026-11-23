using FleetConsole.Api.Tests.Integration;
using FleetConsole.Api.Tests.Persistence;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.DependencyInjection;
using static FleetConsole.Api.Tests.Persistence.PersistenceTestData;

namespace FleetConsole.Api.Tests.Events;

/// <summary>
/// QA R5: domain-event dispatch end to end with real aggregates of every CP1 area, through the Api host's composition
/// root (scanned audit handlers, real dispatcher, <c>ConsoleDbContext</c>, PostgreSQL).
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class DomainEventDispatchIntegrationTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task OneSave_AuditsEveryAggregateItTouches()
    {
        var user = NewUser();
        var cluster = NewCluster();
        Credential credential = null!;
        Grant grant = null!;

        await using (var scope = factory.Services.CreateSignedInScope("dispatch-admin"))
        {
            var sp = scope.ServiceProvider;
            sp.GetRequiredService<IUserRepository>().Add(user);
            sp.GetRequiredService<IClusterRepository>().Add(cluster);
            credential = NewCredential(cluster, sp.GetRequiredService<ITokenProtector>());
            sp.GetRequiredService<ICredentialRepository>().Add(credential);
            grant = NewGrant(user, cluster, credential);
            sp.GetRequiredService<IGrantRepository>().Add(grant);
            await sp.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
        }

        var entries = await LoadEntriesAsync(user.Id.Value, cluster.Id.Value, credential.Id.Value, grant.Id.Value);

        entries.Select(e => e.Action).Order(StringComparer.Ordinal)
            .ShouldBe(["cluster.registered", "credential.added", "grant.created", "user.created"]);
        entries.ShouldAllBe(e => e.Actor.Name == "dispatch-admin" && !e.Actor.IsSystem);
        entries.Select(e => e.CorrelationId).Distinct().Count().ShouldBe(1, "one save, one correlation context");

        var grantEntry = entries.Single(e => e.Action == "grant.created");
        grantEntry.TargetName.ShouldBe($"{user.Username.Value} → {cluster.Name.Value}");
        grantEntry.ClusterName.ShouldBe(cluster.Name.Value);
        grantEntry.RelatedUsername.ShouldBe(user.Username.Value);

        var credentialEntry = entries.Single(e => e.Action == "credential.added");
        credentialEntry.ClusterName.ShouldBe(cluster.Name.Value);
        credentialEntry.RelatedUsername.ShouldBeNull();
        credentialEntry.DetailsJson.ShouldContain("\"fingerprint\"");
        credentialEntry.DetailsJson.ShouldNotContain("fake-test-token");

        entries.Single(e => e.Action == "user.created").RelatedUsername.ShouldBe(user.Username.Value);
        entries.Single(e => e.Action == "cluster.registered").RelatedUsername.ShouldBeNull();
    }

    [Fact]
    public async Task LoginEvents_CarryExplicitActors_AndNeedNoSession()
    {
        // The login flow saves before any session exists (no current user): provisioning and login are attributed to
        // the user, the configuration promotion to "system (config)".
        var user = User.Provision(NewUsername("login"), Now);
        user.RecordLogin("Login Tester", ["fleetconsole-admins"], AdminConfigurationSource.ForGroup("fleetconsole-admins"), provisioned: true, Now).IsSuccess.ShouldBeTrue();

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            scope.ServiceProvider.GetRequiredService<ICurrentUser>().IsAuthenticated.ShouldBeFalse();
            scope.ServiceProvider.GetRequiredService<IUserRepository>().Add(user);
            await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
        }

        var self = AuditActor.ForUser(user.Id, user.Username.Value);
        var entries = await LoadEntriesAsync(user.Id.Value);
        entries.Select(e => e.Action).Order(StringComparer.Ordinal).ShouldBe(["auth.login", "user.promoted", "user.provisioned"]);
        entries.Single(e => e.Action == "user.provisioned").Actor.ShouldBe(self);
        entries.Single(e => e.Action == "auth.login").Actor.ShouldBe(self);
        var promoted = entries.Single(e => e.Action == "user.promoted");
        promoted.Actor.ShouldBe(AuditActor.Configuration);
        promoted.RelatedUsername.ShouldBe(user.Username.Value);
    }

    private async Task<List<AuditEntry>> LoadEntriesAsync(params Guid[] targetIds)
    {
        var ids = targetIds.Select(id => id.ToString()).ToList();
        await using var scope = factory.Services.CreateAsyncScope();
        var readModel = scope.ServiceProvider.GetRequiredService<IReadModel>();
        return await readModel.ToListAsync(readModel.AuditEntries.Where(e => e.TargetId != null && ids.Contains(e.TargetId)), Ct);
    }
}
