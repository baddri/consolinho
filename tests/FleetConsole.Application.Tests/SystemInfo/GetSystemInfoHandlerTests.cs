using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.SystemInfo.GetSystemInfo;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Application.Tests.SystemInfo;

public sealed class GetSystemInfoHandlerTests
{
    [Fact]
    public async Task Handle_ReturnsVersionAndEnvironmentFromPort()
    {
        var handler = new GetSystemInfoHandler(new FakeAppEnvironment("1.2.3+abc123", "Staging"));

        var result = await handler.Handle(new GetSystemInfoQuery(), TestContext.Current.CancellationToken);

        result.IsSuccess.ShouldBeTrue();
        result.Value.ShouldBe(new SystemInfoDto("1.2.3+abc123", "Staging"));
    }

    [Fact]
    public async Task Dispatch_ThroughThePipeline_ReturnsSystemInfo()
    {
        await using var provider = ServiceProviderBuilder.Build();
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>()
            .Send(new GetSystemInfoQuery(), TestContext.Current.CancellationToken);

        result.Value.ShouldBe(new SystemInfoDto("1.2.3+abc123", "Staging"));
    }
}
