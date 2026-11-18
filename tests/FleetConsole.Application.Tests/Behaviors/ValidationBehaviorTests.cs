using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Behaviors;
using FleetConsole.Domain.Common;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Application.Tests.Behaviors;

public sealed class ValidationBehaviorTests
{
    private static readonly CancellationToken Ct = TestContext.Current.CancellationToken;

    [Fact]
    public async Task InvalidRequest_ReturnsValidationFailureWithFieldErrors_AndSkipsHandler()
    {
        await using var provider = ServiceProviderBuilder.Build(unitOfWork: new FakeUnitOfWork());
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new CreateThingCommand("too long name"), Ct);

        result.IsFailure.ShouldBeTrue();
        var error = result.Error.ShouldBeOfType<ValidationError>();
        error.Type.ShouldBe(ErrorType.Validation);
        error.Code.ShouldBe(ValidationError.ValidationFailedCode);
        // Messages from both validators are merged under the same field.
        error.Errors.Keys.ShouldBe(["Name"]);
        error.Errors["Name"].ShouldBe(["Name is too long.", "Name must not contain spaces."]);
        provider.GetRequiredService<CallLog>().Entries.ShouldBeEmpty();
    }

    [Fact]
    public async Task ValidRequest_ReachesHandler()
    {
        await using var provider = ServiceProviderBuilder.Build(unitOfWork: new FakeUnitOfWork());
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new CreateThingCommand("ok"), Ct);

        result.IsSuccess.ShouldBeTrue();
        provider.GetRequiredService<CallLog>().Entries.ShouldBe(["handler"]);
    }

    [Fact]
    public async Task WarningSeverityFailures_DoNotBlockTheRequest()
    {
        await using var provider = ServiceProviderBuilder.Build(unitOfWork: new FakeUnitOfWork());
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new CreateThingCommand("warn"), Ct);

        result.IsSuccess.ShouldBeTrue();
    }

    [Fact]
    public async Task RequestWithoutValidators_PassesThrough()
    {
        var behavior = new ValidationBehavior<EchoQuery, Result<string>>([]);

        var result = await behavior.Handle(new EchoQuery("x"), _ => Task.FromResult<Result<string>>("from handler"), Ct);

        result.Value.ShouldBe("from handler");
    }

    [Fact]
    public async Task ValueLessResult_FailureIsCreated()
    {
        var validator = new InlineValidator<DeleteThingCommand>();
        validator.RuleFor(c => c.Id).NotEmpty().WithMessage("Id is required.");
        var behavior = new ValidationBehavior<DeleteThingCommand, Result>([validator]);

        var result = await behavior.Handle(new DeleteThingCommand(Guid.Empty), _ => throw new InvalidOperationException("handler must not run"), Ct);

        result.Error.ShouldBeOfType<ValidationError>().Errors["Id"].ShouldBe(["Id is required."]);
    }

    [Fact]
    public async Task ValidatorOnNonResultRequest_FailsFast()
    {
        await using var provider = ServiceProviderBuilder.Build();
        await using var scope = provider.CreateAsyncScope();
        var dispatcher = scope.ServiceProvider.GetRequiredService<IDispatcher>();

        var exception = await Should.ThrowAsync<InvalidOperationException>(() => dispatcher.Send(new RawRequest("valid"), Ct));

        exception.Message.ShouldContain(nameof(RawRequest));
    }
}
