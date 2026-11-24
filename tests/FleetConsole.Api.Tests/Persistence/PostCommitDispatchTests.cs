using System.Collections.Concurrent;
using System.Net.Http.Json;
using FleetConsole.Api.Tests.Integration;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Clusters.Events;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;
using FleetConsole.Domain.Users.Events;
using FleetConsole.Infrastructure.Events;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using static FleetConsole.Api.Tests.Persistence.PersistenceTestData;

namespace FleetConsole.Api.Tests.Persistence;

/// <summary>
/// The post-commit domain event stage (ADR-0040 §1) against real PostgreSQL: handlers run only after the change is
/// visible to other connections, never for a failed write, with <see cref="CancellationToken.None"/>, and a failing
/// handler neither fails the command nor stops the handlers after it.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class PostCommitDispatchTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task RegisteringACluster_RunsPostCommitHandlersAfterTheRowIsVisible_AndAThrowingHandlerOnlyLogsAWarning()
    {
        var probe = new Probe();
        await using var host = await factory.CreateVariantAsync(
            new Dictionary<string, string?>(),
            configureServices: services =>
            {
                services.AddSingleton(probe);
                // Throwing first: the recording handler after it must still run.
                services.AddScoped<IPostCommitDomainEventHandler<ClusterRegistered>, ThrowingClusterHandler>();
                services.AddScoped<IPostCommitDomainEventHandler<ClusterRegistered>, RecordingClusterHandler>();
            });
        using var admin = await host.AdminClientAsync();
        var name = NewClusterName().Value;

        using var response = await admin.PostAsJsonAsync(ClusterTestSupport.ClustersPath, ClusterTestSupport.RegisterBody(name), Ct);

        response.IsSuccessStatusCode.ShouldBeTrue("the command succeeds although a post-commit handler threw");
        probe.Observations.ShouldHaveSingleItem().ShouldBe((name, true), "the row was visible in a fresh scope");
        await using (var scope = host.Services.CreateAsyncScope())
        {
            (await scope.ServiceProvider.GetRequiredService<ConsoleDbContext>().Set<Cluster>()
                .CountAsync(c => c.Name == ClusterName.Create(name).Value, Ct)).ShouldBe(1);
        }

        var warning = host.Logs.Entries.Where(e => e.EventId == DomainEventDispatcher.PostCommitHandlerFailedEventId).ShouldHaveSingleItem();
        warning.Level.ShouldBe(LogLevel.Warning);
        warning.Text.ShouldContain(nameof(ClusterRegistered));
        warning.Text.ShouldContain(nameof(ThrowingClusterHandler));
    }

    [Fact]
    public async Task AFailingWrite_DispatchesNothingPostCommit()
    {
        var probe = new Probe();
        await using var host = await factory.CreateVariantAsync(
            new Dictionary<string, string?>(),
            configureServices: services =>
            {
                services.AddSingleton(probe);
                services.AddScoped<IPostCommitDomainEventHandler<UserCreated>, RecordingUserHandler>();
            });
        var username = NewUsername();
        var first = NewUser(username: username);
        await using (var scope = host.Services.CreateSignedInScope())
        {
            scope.ServiceProvider.GetRequiredService<IUserRepository>().Add(first);
            await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
        }

        var duplicate = NewUser(username: username);
        await using (var scope = host.Services.CreateSignedInScope())
        {
            scope.ServiceProvider.GetRequiredService<IUserRepository>().Add(duplicate);
            await Should.ThrowAsync<DuplicateKeyException>(
                () => scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct));
        }

        probe.Observations.ShouldContain((first.Id.Value.ToString(), true));
        probe.Observations.ShouldNotContain(o => o.Key == duplicate.Id.Value.ToString());
    }

    [Fact]
    public async Task CancellationAfterTheCommit_StillDispatches_WithCancellationTokenNone()
    {
        _ = factory.Services; // starts the shared host, which creates and migrates its database
        using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        var dispatcher = new TokenRecordingDispatcher();
        var options = new DbContextOptionsBuilder<ConsoleDbContext>();
        ConsoleDbContext.ConfigureProvider(options, factory.ConnectionString);
        // Simulates the client aborting the request right after the commit, before the post-commit stage.
        options.AddInterceptors(new CancelAfterSaveInterceptor(cancellation));
        await using var db = new ConsoleDbContext(options.Options, dispatcher);
        db.Add(User.Provision(NewUsername(), Now));

        await db.SaveChangesAsync(cancellation.Token);

        cancellation.IsCancellationRequested.ShouldBeTrue();
        dispatcher.PreCommitTokenCanBeCanceled.ShouldBe(true, "the pre-commit stage still gets the request token");
        dispatcher.PostCommitEvents.ShouldNotBeEmpty();
        dispatcher.PostCommitToken.ShouldBe(CancellationToken.None);
    }

    /// <summary>What the recording handlers saw: the event's key and whether its row was visible from a fresh scope.</summary>
    internal sealed class Probe
    {
        private readonly ConcurrentQueue<(string Key, bool Visible)> _observations = new();

        public IReadOnlyList<(string Key, bool Visible)> Observations => [.. _observations];

        public void Record(string key, bool visible) => _observations.Enqueue((key, visible));
    }

    /// <summary>Checks visibility through a new scope (new context, new pooled connection), i.e. after the commit.</summary>
    internal sealed class RecordingClusterHandler(IServiceScopeFactory scopes, Probe probe) : IPostCommitDomainEventHandler<ClusterRegistered>
    {
        public async Task HandleAsync(ClusterRegistered domainEvent, CancellationToken cancellationToken)
        {
            await using var scope = scopes.CreateAsyncScope();
            var visible = await scope.ServiceProvider.GetRequiredService<ConsoleDbContext>().Set<Cluster>()
                .AnyAsync(c => c.Id == domainEvent.ClusterId, cancellationToken);
            probe.Record(domainEvent.Name, visible);
        }
    }

    /// <summary>Same as <see cref="RecordingClusterHandler"/> for users.</summary>
    internal sealed class RecordingUserHandler(IServiceScopeFactory scopes, Probe probe) : IPostCommitDomainEventHandler<UserCreated>
    {
        public async Task HandleAsync(UserCreated domainEvent, CancellationToken cancellationToken)
        {
            await using var scope = scopes.CreateAsyncScope();
            var visible = await scope.ServiceProvider.GetRequiredService<ConsoleDbContext>().Set<User>()
                .AnyAsync(u => u.Id == domainEvent.UserId, cancellationToken);
            probe.Record(domainEvent.UserId.Value.ToString(), visible);
        }
    }

    /// <summary>A broken post-commit handler: it always throws.</summary>
    internal sealed class ThrowingClusterHandler : IPostCommitDomainEventHandler<ClusterRegistered>
    {
        public Task HandleAsync(ClusterRegistered domainEvent, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("Simulated post-commit failure.");
    }

    /// <summary>Records the tokens each stage receives.</summary>
    private sealed class TokenRecordingDispatcher : IDomainEventDispatcher
    {
        public bool? PreCommitTokenCanBeCanceled { get; private set; }

        public IReadOnlyList<IDomainEvent> PostCommitEvents { get; private set; } = [];

        public CancellationToken? PostCommitToken { get; private set; }

        public Task DispatchAsync(IReadOnlyList<IDomainEvent> domainEvents, CancellationToken cancellationToken)
        {
            PreCommitTokenCanBeCanceled = cancellationToken.CanBeCanceled;
            return Task.CompletedTask;
        }

        public Task DispatchPostCommitAsync(IReadOnlyList<IDomainEvent> domainEvents, CancellationToken cancellationToken)
        {
            PostCommitEvents = domainEvents;
            PostCommitToken = cancellationToken;
            return Task.CompletedTask;
        }
    }

    /// <summary>Cancels the save's token once EF reports the write as done (the transaction has committed).</summary>
    private sealed class CancelAfterSaveInterceptor(CancellationTokenSource cancellation) : SaveChangesInterceptor
    {
        public override async ValueTask<int> SavedChangesAsync(SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
        {
            await cancellation.CancelAsync();
            return result;
        }
    }
}
