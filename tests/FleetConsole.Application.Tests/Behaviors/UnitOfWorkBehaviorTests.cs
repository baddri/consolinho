using FleetConsole.Application.Abstractions.Messaging;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Application.Tests.Behaviors;

public sealed class UnitOfWorkBehaviorTests
{
    private static readonly CancellationToken Ct = TestContext.Current.CancellationToken;

    [Fact]
    public async Task SuccessfulCommand_SavesOnce()
    {
        var unitOfWork = new FakeUnitOfWork();
        await using var provider = ServiceProviderBuilder.Build(unitOfWork: unitOfWork);
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new CreateThingCommand("ok"), Ct);

        result.IsSuccess.ShouldBeTrue();
        unitOfWork.SaveCount.ShouldBe(1);
    }

    [Fact]
    public async Task SuccessfulValueLessCommand_SavesOnce()
    {
        var unitOfWork = new FakeUnitOfWork();
        await using var provider = ServiceProviderBuilder.Build(unitOfWork: unitOfWork);
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new DeleteThingCommand(Guid.NewGuid()), Ct);

        result.IsSuccess.ShouldBeTrue();
        unitOfWork.SaveCount.ShouldBe(1);
    }

    [Fact]
    public async Task FailedCommand_DoesNotSave()
    {
        var unitOfWork = new FakeUnitOfWork();
        await using var provider = ServiceProviderBuilder.Build(unitOfWork: unitOfWork);
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new CreateThingCommand("ok", Fail: true), Ct);

        result.IsFailure.ShouldBeTrue();
        unitOfWork.SaveCount.ShouldBe(0);
    }

    [Fact]
    public async Task InvalidCommand_DoesNotSave()
    {
        var unitOfWork = new FakeUnitOfWork();
        await using var provider = ServiceProviderBuilder.Build(unitOfWork: unitOfWork);
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new CreateThingCommand(""), Ct);

        result.IsFailure.ShouldBeTrue();
        unitOfWork.SaveCount.ShouldBe(0);
    }

    [Fact]
    public async Task Query_DoesNotSave()
    {
        var unitOfWork = new FakeUnitOfWork();
        await using var provider = ServiceProviderBuilder.Build(unitOfWork: unitOfWork);
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new EchoQuery("x"), Ct);

        result.IsSuccess.ShouldBeTrue();
        unitOfWork.SaveCount.ShouldBe(0);
    }

    [Fact]
    public async Task Query_WorksWithoutAnyUnitOfWorkRegistered()
    {
        // The behavior's IBaseCommand constraint means the container never constructs it for queries.
        await using var provider = ServiceProviderBuilder.Build();
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new EchoQuery("x"), Ct);

        result.Value.ShouldBe("x");
    }
}
