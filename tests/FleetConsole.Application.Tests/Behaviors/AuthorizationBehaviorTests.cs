using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Application.Tests.Behaviors;

/// <summary>ADM-1: <c>AuthorizationBehavior</c> through the real pipeline (<c>AddApplication()</c>).</summary>
public sealed class AuthorizationBehaviorTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task RequireAuthenticated_Anonymous_Returns401ErrorWithoutCallingHandler()
    {
        var (result, log) = await SendAsync(new AuthenticatedQuery(), FakeCurrentUser.Anonymous);

        result.IsFailure.ShouldBeTrue();
        result.Error.ShouldBe(AuthErrors.Unauthenticated);
        result.Error!.Type.ShouldBe(ErrorType.Unauthorized);
        result.Error.Code.ShouldBe("Auth.Unauthenticated");
        result.Error.Message.ShouldBe("Authentication required.");
        log.Entries.ShouldNotContain("handler");
    }

    [Theory]
    [InlineData(UserRole.User)]
    [InlineData(UserRole.Admin)]
    public async Task RequireAuthenticated_SignedIn_RunsHandler(UserRole role)
    {
        var (result, log) = await SendAsync(new AuthenticatedQuery(), FakeCurrentUser.SignedIn(role));

        result.Value.ShouldBe("ok");
        log.Entries.ShouldContain("handler");
    }

    [Fact]
    public async Task AdminRequest_Anonymous_Returns401()
    {
        var (result, _) = await SendAsync(new AdminQuery(), FakeCurrentUser.Anonymous);

        result.Error.ShouldBe(AuthErrors.Unauthenticated);
    }

    [Fact]
    public async Task AdminRequest_NonAdmin_Returns403ForbiddenWithoutCallingHandler()
    {
        var (result, log) = await SendAsync(new AdminQuery(), FakeCurrentUser.SignedIn(UserRole.User));

        result.Error.ShouldBe(AuthErrors.Forbidden);
        result.Error!.Type.ShouldBe(ErrorType.Forbidden);
        result.Error.Code.ShouldBe("Auth.Forbidden");
        result.Error.Message.ShouldBe("You don't have access to Fleet administration.");
        log.Entries.ShouldNotContain("handler");
    }

    [Fact]
    public async Task AdminRequest_Admin_RunsHandler()
    {
        var (result, log) = await SendAsync(new AdminQuery(), FakeCurrentUser.SignedIn(UserRole.Admin));

        result.Value.ShouldBe("ok");
        log.Entries.ShouldContain("handler");
    }

    [Fact]
    public async Task AdminCommand_NonAdmin_Returns403AndDoesNotSave()
    {
        var unitOfWork = new FakeUnitOfWork();

        var (result, log) = await SendAsync(new AdminMutatingCommand("x"), FakeCurrentUser.SignedIn(UserRole.User), unitOfWork);

        result.Error.ShouldBe(AuthErrors.Forbidden);
        log.Entries.ShouldNotContain("handler");
        unitOfWork.SaveCount.ShouldBe(0);
    }

    [Fact]
    public async Task AdminCommand_AnonymousWithInvalidInput_Returns401NotValidationErrors()
    {
        // Authorization runs before validation: callers without access learn nothing about valid input.
        var (result, _) = await SendAsync(new AdminMutatingCommand(""), FakeCurrentUser.Anonymous, new FakeUnitOfWork());

        result.Error.ShouldBe(AuthErrors.Unauthenticated);
    }

    [Fact]
    public void AdminRequest_RequiresAdminRole()
    {
        // The role comes from IAdminRequest's default interface implementation, reachable only through the interface.
        (new AdminQuery() is IRequireRole { RequiredRole: UserRole.Admin }).ShouldBeTrue();
    }

    [Fact]
    public async Task RequireRole_ComparesRolesExactly_AdminIsNotInUserRole()
    {
        var (adminResult, _) = await SendAsync(new UserRoleQuery(), FakeCurrentUser.SignedIn(UserRole.Admin));
        var (userResult, _) = await SendAsync(new UserRoleQuery(), FakeCurrentUser.SignedIn(UserRole.User));

        adminResult.Error.ShouldBe(AuthErrors.Forbidden);
        userResult.Value.ShouldBe("ok");
    }

    [Fact]
    public async Task UnmarkedRequest_RunsWithoutAnyCurrentUserRegistered()
    {
        // The IRequireAuthenticated constraint means the container never constructs the behavior for other requests.
        await using var provider = ServiceProviderBuilder.Build(withAuditPorts: false);
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new EchoQuery("x"), Ct);

        result.Value.ShouldBe("x");
    }

    [Fact]
    public async Task ProtectedRequestWithNonResultResponse_Throws()
    {
        await using var provider = ServiceProviderBuilder.Build(services => services.AddScoped<ICurrentUser>(_ => FakeCurrentUser.Anonymous));
        await using var scope = provider.CreateAsyncScope();
        var dispatcher = scope.ServiceProvider.GetRequiredService<IDispatcher>();

        await Should.ThrowAsync<InvalidOperationException>(() => dispatcher.Send(new ProtectedRawRequest(), Ct));
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
