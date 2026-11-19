using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Domain.Common;
using FleetConsole.Infrastructure.Events;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Events;

/// <summary>Unit tests of <see cref="DomainEventDispatcher"/> with a plain container (no database).</summary>
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

        await new DomainEventDispatcher(scope.ServiceProvider)
            .DispatchAsync([new Pinged("a"), new Ponged("b"), new Pinged("c")], Ct);

        log.ShouldBe(["first a", "second a", "pong b", "first c", "second c"]);
    }

    [Fact]
    public async Task Dispatch_OfAnEventWithoutHandlers_DoesNothing()
    {
        var log = new List<string>();
        await using var provider = Build(log, _ => { });
        await using var scope = provider.CreateAsyncScope();

        await new DomainEventDispatcher(scope.ServiceProvider).DispatchAsync([new Pinged("x")], Ct);

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
            () => new DomainEventDispatcher(scope.ServiceProvider).DispatchAsync([new Pinged("a"), new Ponged("b")], Ct));

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

        await new DomainEventDispatcher(scope.ServiceProvider).DispatchAsync([new Pinged("a")], Ct);

        log.ShouldBe([marker.Id.ToString()]);
    }

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

    internal sealed class ScopeReportingHandler(ScopeMarker marker, List<string> log) : IDomainEventHandler<Pinged>
    {
        public Task Handle(Pinged domainEvent, CancellationToken cancellationToken)
        {
            log.Add(marker.Id.ToString());
            return Task.CompletedTask;
        }
    }
}
