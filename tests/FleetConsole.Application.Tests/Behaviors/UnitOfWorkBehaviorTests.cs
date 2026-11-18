using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Common;
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

    [Fact]
    public async Task ConcurrencyConflictOnSave_BecomesConflictResult()
    {
        var unitOfWork = new FakeUnitOfWork { ThrowOnSave = new ConcurrencyConflictException() };
        await using var provider = ServiceProviderBuilder.Build(unitOfWork: unitOfWork);
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new CreateThingCommand("ok"), Ct);

        result.IsFailure.ShouldBeTrue();
        result.Error.Type.ShouldBe(ErrorType.Conflict);
        result.Error.Code.ShouldBe("Concurrency.Conflict");
        result.Error.Message.ShouldBe("This item was changed by someone else. Reload and try again.");
    }

    [Fact]
    public async Task DuplicateKeyOnSave_BecomesConflictResult()
    {
        var unitOfWork = new FakeUnitOfWork { ThrowOnSave = DuplicateKeyException.ForConstraint("ix_things_name", new InvalidOperationException()) };
        await using var provider = ServiceProviderBuilder.Build(unitOfWork: unitOfWork);
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new CreateThingCommand("ok"), Ct);

        result.IsFailure.ShouldBeTrue();
        result.Error.Type.ShouldBe(ErrorType.Conflict);
        result.Error.Code.ShouldBe("Persistence.DuplicateKey");
        result.Error.Message.ShouldBe("This item already exists. Reload and try again.");
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task CommitRaceOnValueLessCommand_BecomesConflictResult(bool concurrency)
    {
        var unitOfWork = new FakeUnitOfWork
        {
            ThrowOnSave = concurrency ? new ConcurrencyConflictException() : new DuplicateKeyException(),
        };
        await using var provider = ServiceProviderBuilder.Build(unitOfWork: unitOfWork);
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new DeleteThingCommand(Guid.NewGuid()), Ct);

        result.IsFailure.ShouldBeTrue();
        result.Error.Code.ShouldBe(concurrency ? "Concurrency.Conflict" : "Persistence.DuplicateKey");
    }

    [Fact]
    public async Task OtherSaveFailures_StillThrow()
    {
        // Anything else is an infrastructure fault: the global exception handler turns it into a 500.
        var unitOfWork = new FakeUnitOfWork { ThrowOnSave = new InvalidOperationException("database down") };
        await using var provider = ServiceProviderBuilder.Build(unitOfWork: unitOfWork);
        await using var scope = provider.CreateAsyncScope();

        await Should.ThrowAsync<InvalidOperationException>(
            () => scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new CreateThingCommand("ok"), Ct));
    }
}
