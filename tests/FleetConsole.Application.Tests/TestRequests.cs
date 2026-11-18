using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Common;
using FluentValidation;

namespace FleetConsole.Application.Tests;

// Requests, handlers and validators used across the dispatcher/behavior tests. The fixture registers every handler
// and validator in this assembly through the same scanning code AddApplication() uses.

/// <summary>Records the order in which pipeline steps and handlers run.</summary>
public sealed class CallLog
{
    public List<string> Entries { get; } = [];
}

public sealed record EchoQuery(string Text) : IQuery<string>;

internal sealed class EchoQueryHandler(CallLog log) : IRequestHandler<EchoQuery, Result<string>>
{
    public Task<Result<string>> Handle(EchoQuery request, CancellationToken cancellationToken)
    {
        log.Entries.Add("handler");
        return Task.FromResult<Result<string>>(request.Text);
    }
}

public sealed record CreateThingCommand(string Name, bool Fail = false) : ICommand<Guid>;

internal sealed class CreateThingCommandHandler(CallLog log) : IRequestHandler<CreateThingCommand, Result<Guid>>
{
    public Task<Result<Guid>> Handle(CreateThingCommand request, CancellationToken cancellationToken)
    {
        log.Entries.Add("handler");
        return Task.FromResult<Result<Guid>>(
            request.Fail ? Error.Conflict("Things.Duplicate", "Thing already exists.") : Guid.NewGuid());
    }
}

internal sealed class CreateThingCommandValidator : AbstractValidator<CreateThingCommand>
{
    public CreateThingCommandValidator()
    {
        RuleFor(c => c.Name).NotEmpty().WithMessage("Name is required.");
        RuleFor(c => c.Name).MaximumLength(5).WithMessage("Name is too long.");
    }
}

/// <summary>A second validator for the same request: its failures are merged with the first one's.</summary>
internal sealed class CreateThingCommandNameRulesValidator : AbstractValidator<CreateThingCommand>
{
    public CreateThingCommandNameRulesValidator()
    {
        RuleFor(c => c.Name).Must(name => !name.Contains(' ', StringComparison.Ordinal)).WithMessage("Name must not contain spaces.");
        RuleFor(c => c.Name).Must(name => name != "warn").WithMessage("Just a warning.").WithSeverity(Severity.Warning);
    }
}

public sealed record DeleteThingCommand(Guid Id) : ICommand;

internal sealed class DeleteThingCommandHandler(CallLog log) : IRequestHandler<DeleteThingCommand, Result>
{
    public Task<Result> Handle(DeleteThingCommand request, CancellationToken cancellationToken)
    {
        log.Entries.Add("handler");
        return Task.FromResult(request.Id == Guid.Empty ? Error.NotFound("Things.NotFound", "No such thing.") : Result.Success());
    }
}

/// <summary>Request type with no handler, for the handler-not-found test.</summary>
public sealed record OrphanQuery : IQuery<int>;

/// <summary>Returns the token it received, to prove the caller's token reaches the handler.</summary>
public sealed record TokenQuery : IQuery<CancellationToken>;

internal sealed class TokenQueryHandler : IRequestHandler<TokenQuery, Result<CancellationToken>>
{
    public Task<Result<CancellationToken>> Handle(TokenQuery request, CancellationToken cancellationToken) =>
        Task.FromResult<Result<CancellationToken>>(cancellationToken);
}

/// <summary>A non-Result request with a validator: a wiring bug the validation behavior must report.</summary>
public sealed record RawRequest(string Value) : IRequest<string>;

internal sealed class RawRequestHandler : IRequestHandler<RawRequest, string>
{
    public Task<string> Handle(RawRequest request, CancellationToken cancellationToken) => Task.FromResult(request.Value);
}

internal sealed class RawRequestValidator : AbstractValidator<RawRequest>
{
    public RawRequestValidator() => RuleFor(r => r.Value).NotEmpty();
}

/// <summary>Pipeline behavior that records entry/exit so tests can assert ordering.</summary>
internal class RecordingBehavior<TRequest, TResponse>(CallLog log, string name) : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        log.Entries.Add($"{name}:before");
        var response = await next(cancellationToken);
        log.Entries.Add($"{name}:after");
        return response;
    }
}

internal sealed class FirstBehavior<TRequest, TResponse>(CallLog log) : RecordingBehavior<TRequest, TResponse>(log, "first")
    where TRequest : IRequest<TResponse>;

internal sealed class SecondBehavior<TRequest, TResponse>(CallLog log) : RecordingBehavior<TRequest, TResponse>(log, "second")
    where TRequest : IRequest<TResponse>;

internal sealed class ThirdBehavior<TRequest, TResponse>(CallLog log) : RecordingBehavior<TRequest, TResponse>(log, "third")
    where TRequest : IRequest<TResponse>;

/// <summary>Behavior that answers queries itself without calling the handler.</summary>
internal sealed class ShortCircuitBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    public Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken) =>
        Task.FromResult((TResponse)(object)Result.Success("short-circuited"));
}
