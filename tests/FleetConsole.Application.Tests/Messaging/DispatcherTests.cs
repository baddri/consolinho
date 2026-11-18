using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Common;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Application.Tests.Messaging;

public sealed class DispatcherTests
{
    private static readonly CancellationToken Ct = TestContext.Current.CancellationToken;

    [Fact]
    public async Task Send_RunsBehaviorsInRegistrationOrder_AroundTheHandler()
    {
        await using var provider = ServiceProviderBuilder.Build(services =>
        {
            services.AddScoped(typeof(IPipelineBehavior<,>), typeof(FirstBehavior<,>));
            services.AddScoped(typeof(IPipelineBehavior<,>), typeof(SecondBehavior<,>));
            services.AddScoped(typeof(IPipelineBehavior<,>), typeof(ThirdBehavior<,>));
        }, withApplicationPipeline: false);
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new EchoQuery("hi"), Ct);

        result.Value.ShouldBe("hi");
        provider.GetRequiredService<CallLog>().Entries.ShouldBe(
        [
            "first:before", "second:before", "third:before",
            "handler",
            "third:after", "second:after", "first:after",
        ]);
    }

    [Fact]
    public async Task Send_WithoutBehaviors_CallsHandlerDirectly()
    {
        await using var provider = ServiceProviderBuilder.Build(withApplicationPipeline: false);
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new EchoQuery("plain"), Ct);

        result.Value.ShouldBe("plain");
        provider.GetRequiredService<CallLog>().Entries.ShouldBe(["handler"]);
    }

    [Fact]
    public async Task Send_WhenBehaviorShortCircuits_DoesNotCallHandler()
    {
        await using var provider = ServiceProviderBuilder.Build(
            services => services.AddScoped(typeof(IPipelineBehavior<,>), typeof(ShortCircuitBehavior<,>)),
            withApplicationPipeline: false);
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new EchoQuery("hi"), Ct);

        result.Value.ShouldBe("short-circuited");
        provider.GetRequiredService<CallLog>().Entries.ShouldBeEmpty();
    }

    [Fact]
    public async Task Send_WithoutHandler_ThrowsWithRequestName()
    {
        await using var provider = ServiceProviderBuilder.Build(withApplicationPipeline: false);
        await using var scope = provider.CreateAsyncScope();
        var dispatcher = scope.ServiceProvider.GetRequiredService<IDispatcher>();

        var exception = await Should.ThrowAsync<InvalidOperationException>(() => dispatcher.Send(new OrphanQuery(), Ct));

        exception.Message.ShouldContain(nameof(OrphanQuery));
    }

    [Fact]
    public async Task Send_PassesCallerCancellationTokenToHandler()
    {
        await using var provider = ServiceProviderBuilder.Build();
        await using var scope = provider.CreateAsyncScope();
        using var cts = new CancellationTokenSource();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new TokenQuery(), cts.Token);

        result.Value.ShouldBe(cts.Token);
    }

    [Fact]
    public async Task Send_RepeatedlyAndForDifferentRequestTypes_UsesTheRightHandler()
    {
        await using var provider = ServiceProviderBuilder.Build(withApplicationPipeline: false);
        await using var scope = provider.CreateAsyncScope();
        var dispatcher = scope.ServiceProvider.GetRequiredService<IDispatcher>();

        (await dispatcher.Send(new EchoQuery("a"), Ct)).Value.ShouldBe("a");
        (await dispatcher.Send(new EchoQuery("b"), Ct)).Value.ShouldBe("b");
        (await dispatcher.Send(new DeleteThingCommand(Guid.Empty), Ct)).Error!.Code.ShouldBe("Things.NotFound");
    }

    [Fact]
    public void Send_WithNullRequest_Throws()
    {
        using var provider = ServiceProviderBuilder.Build(withApplicationPipeline: false);
        using var scope = provider.CreateScope();
        var dispatcher = scope.ServiceProvider.GetRequiredService<IDispatcher>();

        Should.Throw<ArgumentNullException>(() => dispatcher.Send<Result>(null!, Ct));
    }
}
