using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Domain.Common;
using FleetConsole.Infrastructure.Events;
using FleetConsole.Api.Tests.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace FleetConsole.Api.Tests.Events;

/// <summary>Unit tests of <see cref="DomainEventDispatcher"/> (both stages) with a plain container (no database).</summary>
public sealed class DomainEventDispatcherTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Dispatch_RunsEveryHandlerOfEachEvent_InEventThenRegistrationOrder()
    {
        var log = new List<string>();
        await using var provider = Build(log, services =>
        {
            services.AddScoped<IDomainEventHandler<Pinged>, FirstPingHandler>();
            services.AddScoped<IDomainEventHandler<Pinged>, SecondPingHandler>();
            services.AddScoped<IDomainEventHandler<Ponged>, PongHandler>();
        });
        await using var scope = provider.CreateAsyncScope();

        await NewDispatcher(scope)
            .DispatchAsync([new Pinged("a"), new Ponged("b"), new Pinged("c")], Ct);

        log.ShouldBe(["first a", "second a", "pong b", "first c", "second c"]);
    }

    [Fact]
    public async Task Dispatch_OfAnEventWithoutHandlers_DoesNothing()
    {
        var log = new List<string>();
        await using var provider = Build(log, _ => { });
        await using var scope = provider.CreateAsyncScope();

        await NewDispatcher(scope).DispatchAsync([new Pinged("x")], Ct);

        log.ShouldBeEmpty();
    }

    [Fact]
    public async Task Dispatch_PropagatesAHandlerException_AndStops()
    {
        var log = new List<string>();
        await using var provider = Build(log, services =>
        {
            services.AddScoped<IDomainEventHandler<Pinged>, ThrowingPingHandler>();
            services.AddScoped<IDomainEventHandler<Ponged>, PongHandler>();
        });
        await using var scope = provider.CreateAsyncScope();

        await Should.ThrowAsync<InvalidOperationException>(
            () => NewDispatcher(scope).DispatchAsync([new Pinged("a"), new Ponged("b")], Ct));

        log.ShouldBeEmpty();
    }

    [Fact]
    public async Task Dispatch_ResolvesHandlersFromTheGivenScope()
    {
        var log = new List<string>();
        await using var provider = Build(log, services =>
        {
            services.AddScoped<ScopeMarker>();
            services.AddScoped<IDomainEventHandler<Pinged>, ScopeReportingHandler>();
        });
        await using var scope = provider.CreateAsyncScope();
        var marker = scope.ServiceProvider.GetRequiredService<ScopeMarker>();

        await NewDispatcher(scope).DispatchAsync([new Pinged("a")], Ct);

        log.ShouldBe([marker.Id.ToString()]);
    }

    [Fact]
    public async Task DispatchPostCommit_RunsEveryPostCommitHandler_InEventThenRegistrationOrder_AndNoPreCommitHandler()
    {
        var log = new List<string>();
        await using var provider = Build(log, services =>
        {
            services.AddScoped<IDomainEventHandler<Pinged>, FirstPingHandler>();
            services.AddScoped<IPostCommitDomainEventHandler<Pinged>, PostCommitPingHandler>();
            services.AddScoped<IPostCommitDomainEventHandler<Pinged>, SecondPostCommitPingHandler>();
            services.AddScoped<IPostCommitDomainEventHandler<Ponged>, PostCommitPongHandler>();
        });
        await using var scope = provider.CreateAsyncScope();

        await NewDispatcher(scope).DispatchPostCommitAsync([new Pinged("a"), new Ponged("b"), new Pinged("c")], Ct);

        log.ShouldBe(["post a", "post2 a", "post pong b", "post c", "post2 c"]);
    }

    [Fact]
    public async Task Dispatch_PreCommit_DoesNotRunPostCommitHandlers()
    {
        var log = new List<string>();
        await using var provider = Build(log, services => services.AddScoped<IPostCommitDomainEventHandler<Pinged>, PostCommitPingHandler>());
        await using var scope = provider.CreateAsyncScope();

        await NewDispatcher(scope).DispatchAsync([new Pinged("a")], Ct);

        log.ShouldBeEmpty();
    }

    [Theory]
    [InlineData(typeof(InvalidOperationException))]
    [InlineData(typeof(OperationCanceledException))]
    public async Task DispatchPostCommit_AThrowingHandler_IsLoggedAndSwallowed_LaterHandlersAndEventsStillRun(Type exceptionType)
    {
        var log = new List<string>();
        await using var provider = Build(log, services =>
        {
            services.AddSingleton(new ThrowingPostCommitPingHandler((Exception)Activator.CreateInstance(exceptionType, "secret-payload-text")!));
            services.AddScoped<IPostCommitDomainEventHandler<Pinged>>(sp => sp.GetRequiredService<ThrowingPostCommitPingHandler>());
            services.AddScoped<IPostCommitDomainEventHandler<Pinged>, PostCommitPingHandler>();
            services.AddScoped<IPostCommitDomainEventHandler<Ponged>, PostCommitPongHandler>();
        });
        await using var scope = provider.CreateAsyncScope();
        var captured = new CapturedLogs();
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddProvider(captured));

        await new DomainEventDispatcher(scope.ServiceProvider, loggerFactory.CreateLogger<DomainEventDispatcher>())
            .DispatchPostCommitAsync([new Pinged("a"), new Ponged("b")], Ct);

        log.ShouldBe(["post a", "post pong b"]);
        var warning = captured.Entries.ShouldHaveSingleItem();
        warning.Level.ShouldBe(LogLevel.Warning);
        warning.EventId.ShouldBe(DomainEventDispatcher.PostCommitHandlerFailedEventId);
        warning.Text.ShouldContain(nameof(Pinged));
        warning.Text.ShouldContain(nameof(ThrowingPostCommitPingHandler));
        warning.Text.ShouldContain(exceptionType.Name);
        warning.Text.ShouldNotContain("secret-payload-text", customMessage: "only type names are logged");
    }

    private static DomainEventDispatcher NewDispatcher(AsyncServiceScope scope) =>
        new(scope.ServiceProvider, NullLogger<DomainEventDispatcher>.Instance);

    private static ServiceProvider Build(List<string> log, Action<IServiceCollection> configure)
    {
        var services = new ServiceCollection();
        services.AddSingleton(log);
        configure(services);
        return services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true, ValidateOnBuild = true });
    }

    internal sealed record Pinged(string Value) : IDomainEvent;

    internal sealed record Ponged(string Value) : IDomainEvent;

    internal sealed class ScopeMarker
    {
        public Guid Id { get; } = Guid.NewGuid();
    }

    internal sealed class FirstPingHandler(List<string> log) : IDomainEventHandler<Pinged>
    {
        public Task Handle(Pinged domainEvent, CancellationToken cancellationToken)
        {
            log.Add($"first {domainEvent.Value}");
            return Task.CompletedTask;
        }
    }

    internal sealed class SecondPingHandler(List<string> log) : IDomainEventHandler<Pinged>
    {
        public async Task Handle(Pinged domainEvent, CancellationToken cancellationToken)
        {
            await Task.Yield();
            log.Add($"second {domainEvent.Value}");
        }
    }

    internal sealed class PongHandler(List<string> log) : IDomainEventHandler<Ponged>
    {
        public Task Handle(Ponged domainEvent, CancellationToken cancellationToken)
        {
            log.Add($"pong {domainEvent.Value}");
            return Task.CompletedTask;
        }
    }

    internal sealed class ThrowingPingHandler : IDomainEventHandler<Pinged>
    {
        public Task Handle(Pinged domainEvent, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("boom");
    }

    internal sealed class PostCommitPingHandler(List<string> log) : IPostCommitDomainEventHandler<Pinged>
    {
        public Task HandleAsync(Pinged domainEvent, CancellationToken cancellationToken)
        {
            log.Add($"post {domainEvent.Value}");
            return Task.CompletedTask;
        }
    }

    internal sealed class SecondPostCommitPingHandler(List<string> log) : IPostCommitDomainEventHandler<Pinged>
    {
        public async Task HandleAsync(Pinged domainEvent, CancellationToken cancellationToken)
        {
            await Task.Yield();
            log.Add($"post2 {domainEvent.Value}");
        }
    }

    internal sealed class PostCommitPongHandler(List<string> log) : IPostCommitDomainEventHandler<Ponged>
    {
        public Task HandleAsync(Ponged domainEvent, CancellationToken cancellationToken)
        {
            log.Add($"post pong {domainEvent.Value}");
            return Task.CompletedTask;
        }
    }

    internal sealed class ThrowingPostCommitPingHandler(Exception exception) : IPostCommitDomainEventHandler<Pinged>
    {
        public async Task HandleAsync(Pinged domainEvent, CancellationToken cancellationToken)
        {
            await Task.Yield();
            throw exception;
        }
    }

    internal sealed class ScopeReportingHandler(ScopeMarker marker, List<string> log) : IDomainEventHandler<Pinged>
    {
        public Task Handle(Pinged domainEvent, CancellationToken cancellationToken)
        {
            log.Add(marker.Id.ToString());
            return Task.CompletedTask;
        }
    }
}
