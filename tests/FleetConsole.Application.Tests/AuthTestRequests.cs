using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;
using FluentValidation;

namespace FleetConsole.Application.Tests;

// Requests with authorization markers for the AuthorizationBehavior/ReadOnlyGuardBehavior tests. Handlers record
// "handler" in the CallLog so tests can prove the handler was (not) reached.

/// <summary>Any signed-in user may run it.</summary>
public sealed record AuthenticatedQuery : IQuery<string>, IRequireAuthenticated;

internal sealed class AuthenticatedQueryHandler(CallLog log) : IRequestHandler<AuthenticatedQuery, Result<string>>
{
    public Task<Result<string>> Handle(AuthenticatedQuery request, CancellationToken cancellationToken)
    {
        log.Entries.Add("handler");
        return Task.FromResult<Result<string>>("ok");
    }
}

/// <summary>An admin query (readable by read-only admins).</summary>
public sealed record AdminQuery : IQuery<string>, IAdminRequest;

internal sealed class AdminQueryHandler(CallLog log) : IRequestHandler<AdminQuery, Result<string>>
{
    public Task<Result<string>> Handle(AdminQuery request, CancellationToken cancellationToken)
    {
        log.Entries.Add("handler");
        return Task.FromResult<Result<string>>("ok");
    }
}

/// <summary>An admin command, as every CP1 admin command is declared: admin + mutating.</summary>
public sealed record AdminMutatingCommand(string Name) : ICommand<Guid>, IAdminRequest, IMutatingCommand;

internal sealed class AdminMutatingCommandHandler(CallLog log) : IRequestHandler<AdminMutatingCommand, Result<Guid>>
{
    public Task<Result<Guid>> Handle(AdminMutatingCommand request, CancellationToken cancellationToken)
    {
        log.Entries.Add("handler");
        return Task.FromResult<Result<Guid>>(Guid.NewGuid());
    }
}

/// <summary>Records "validator" in the CallLog when it runs, so tests can prove validation was (not) reached.</summary>
internal sealed class AdminMutatingCommandValidator : AbstractValidator<AdminMutatingCommand>
{
    public AdminMutatingCommandValidator(CallLog log) =>
        RuleFor(c => c.Name)
            .Must(name =>
            {
                log.Entries.Add("validator");
                return !string.IsNullOrEmpty(name);
            })
            .WithMessage("Name is required.");
}

/// <summary>A command that needs a session but changes nothing read-only users must be kept from (e.g. logout).</summary>
public sealed record NonMutatingCommand : ICommand, IRequireAuthenticated;

internal sealed class NonMutatingCommandHandler(CallLog log) : IRequestHandler<NonMutatingCommand, Result>
{
    public Task<Result> Handle(NonMutatingCommand request, CancellationToken cancellationToken)
    {
        log.Entries.Add("handler");
        return Task.FromResult(Result.Success());
    }
}

/// <summary>Requires the plain user role, to prove roles are compared exactly (not hierarchically).</summary>
public sealed record UserRoleQuery : IQuery<string>, IRequireRole
{
    public UserRole RequiredRole => UserRole.User;
}

internal sealed class UserRoleQueryHandler(CallLog log) : IRequestHandler<UserRoleQuery, Result<string>>
{
    public Task<Result<string>> Handle(UserRoleQuery request, CancellationToken cancellationToken)
    {
        log.Entries.Add("handler");
        return Task.FromResult<Result<string>>("ok");
    }
}

/// <summary>A mutating command with no other authorization marker (IMutatingCommand alone implies authentication).</summary>
public sealed record PlainMutatingCommand : ICommand, IMutatingCommand;

internal sealed class PlainMutatingCommandHandler(CallLog log) : IRequestHandler<PlainMutatingCommand, Result>
{
    public Task<Result> Handle(PlainMutatingCommand request, CancellationToken cancellationToken)
    {
        log.Entries.Add("handler");
        return Task.FromResult(Result.Success());
    }
}

/// <summary>A protected request whose response can't carry an error: a wiring bug the behavior must report.</summary>
public sealed record ProtectedRawRequest : IRequest<string>, IRequireAuthenticated;

internal sealed class ProtectedRawRequestHandler : IRequestHandler<ProtectedRawRequest, string>
{
    public Task<string> Handle(ProtectedRawRequest request, CancellationToken cancellationToken) => Task.FromResult("raw");
}

/// <summary>A protected mutating request whose response can't carry an error.</summary>
public sealed record MutatingRawRequest : IRequest<string>, IMutatingCommand;

internal sealed class MutatingRawRequestHandler : IRequestHandler<MutatingRawRequest, string>
{
    public Task<string> Handle(MutatingRawRequest request, CancellationToken cancellationToken) => Task.FromResult("raw");
}
