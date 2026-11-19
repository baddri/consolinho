using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Application.Tests.Behaviors;

/// <summary>ADM-2: <c>ReadOnlyGuardBehavior</c> through the real pipeline (<c>AddApplication()</c>).</summary>
public sealed class ReadOnlyGuardBehaviorTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task MutatingCommand_ReadOnlyAdmin_Returns403ReadOnlyWithoutCallingHandlerOrSaving()
    {
        var unitOfWork = new FakeUnitOfWork();

        var (result, log) = await SendAsync(new AdminMutatingCommand("x"), FakeCurrentUser.SignedIn(UserRole.Admin, isReadOnly: true), unitOfWork);

        result.Error.ShouldBe(AuthErrors.ReadOnly);
        result.Error!.Type.ShouldBe(ErrorType.Forbidden);
        result.Error.Code.ShouldBe("Auth.ReadOnly");
        result.Error.Message.ShouldBe("Your account is read-only.");
        log.Entries.ShouldNotContain("handler");
        unitOfWork.SaveCount.ShouldBe(0);
    }

    [Fact]
    public async Task MutatingCommand_WritableAdmin_RunsHandlerAndSaves()
    {
        var unitOfWork = new FakeUnitOfWork();

        var (result, log) = await SendAsync(new AdminMutatingCommand("x"), FakeCurrentUser.SignedIn(UserRole.Admin), unitOfWork);

        result.IsSuccess.ShouldBeTrue();
        log.Entries.ShouldContain("handler");
        unitOfWork.SaveCount.ShouldBe(1);
    }

    [Fact]
    public async Task AdminQuery_ReadOnlyAdmin_IsAllowed()
    {
        // Auditor persona: read-only admins can still read Administration.
        var (result, log) = await SendAsync(new AdminQuery(), FakeCurrentUser.SignedIn(UserRole.Admin, isReadOnly: true));

        result.Value.ShouldBe("ok");
        log.Entries.ShouldContain("handler");
    }

    [Fact]
    public async Task NonMutatingCommand_ReadOnlyUser_IsAllowed()
    {
        var unitOfWork = new FakeUnitOfWork();

        var (result, log) = await SendAsync(new NonMutatingCommand(), FakeCurrentUser.SignedIn(UserRole.User, isReadOnly: true), unitOfWork);

        result.IsSuccess.ShouldBeTrue();
        log.Entries.ShouldContain("handler");
        unitOfWork.SaveCount.ShouldBe(1);
    }

    [Fact]
    public async Task MutatingCommand_ReadOnlyAdminWithInvalidInput_ReturnsReadOnlyWithoutRunningValidator()
    {
        // Contract §7 check order: 401 → Auth.Forbidden → Auth.ReadOnly → field validation.
        var (result, log) = await SendAsync(new AdminMutatingCommand(""), FakeCurrentUser.SignedIn(UserRole.Admin, isReadOnly: true), new FakeUnitOfWork());

        result.Error.ShouldBe(AuthErrors.ReadOnly);
        log.Entries.ShouldNotContain("validator");
        log.Entries.ShouldNotContain("handler");
    }

    [Fact]
    public async Task MutatingCommand_WritableAdminWithInvalidInput_ReturnsValidationErrors()
    {
        // Control for the test above: the same invalid command from a writable admin does reach validation.
        var (result, log) = await SendAsync(new AdminMutatingCommand(""), FakeCurrentUser.SignedIn(UserRole.Admin), new FakeUnitOfWork());

        result.Error.ShouldBeOfType<ValidationError>();
        log.Entries.ShouldContain("validator");
        log.Entries.ShouldNotContain("handler");
    }

    [Fact]
    public async Task MutatingCommand_ReadOnlyNonAdmin_ReturnsForbiddenNotReadOnly()
    {
        // The role check comes first, so a non-admin is told they lack access, not that they are read-only.
        var (result, _) = await SendAsync(new AdminMutatingCommand("x"), FakeCurrentUser.SignedIn(UserRole.User, isReadOnly: true), new FakeUnitOfWork());

        result.Error.ShouldBe(AuthErrors.Forbidden);
    }

    [Fact]
    public async Task MutatingCommand_Anonymous_Returns401WithoutCallingHandlerOrSaving()
    {
        // IMutatingCommand implies IRequireAuthenticated: an anonymous caller (IsReadOnly = false) must not slip past.
        var unitOfWork = new FakeUnitOfWork();

        var (result, log) = await SendAsync(new PlainMutatingCommand(), FakeCurrentUser.Anonymous, unitOfWork);

        result.Error.ShouldBe(AuthErrors.Unauthenticated);
        log.Entries.ShouldNotContain("handler");
        unitOfWork.SaveCount.ShouldBe(0);
    }

    [Fact]
    public async Task PlainMutatingCommand_WritableUser_RunsHandler()
    {
        var (result, log) = await SendAsync(new PlainMutatingCommand(), FakeCurrentUser.SignedIn(UserRole.User), new FakeUnitOfWork());

        result.IsSuccess.ShouldBeTrue();
        log.Entries.ShouldContain("handler");
    }

    [Fact]
    public async Task MutatingRequestWithNonResultResponse_Throws()
    {
        var currentUser = FakeCurrentUser.SignedIn(UserRole.Admin, isReadOnly: true);
        await using var provider = ServiceProviderBuilder.Build(services => services.AddScoped<ICurrentUser>(_ => currentUser));
        await using var scope = provider.CreateAsyncScope();
        var dispatcher = scope.ServiceProvider.GetRequiredService<IDispatcher>();

        await Should.ThrowAsync<InvalidOperationException>(() => dispatcher.Send(new MutatingRawRequest(), Ct));
    }

    private static async Task<(TResponse Result, CallLog Log)> SendAsync<TResponse>(
        IRequest<TResponse> request, FakeCurrentUser currentUser, FakeUnitOfWork? unitOfWork = null)
    {
        await using var provider = ServiceProviderBuilder.Build(
            services => services.AddScoped<ICurrentUser>(_ => currentUser), unitOfWork: unitOfWork);
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(request, Ct);
        return (result, scope.ServiceProvider.GetRequiredService<CallLog>());
    }
}
