using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Auth.GetCurrentUser;
using FleetConsole.Application.Auth.GetSessionState;
using FleetConsole.Application.Auth.LogOut;
using FleetConsole.Application.Tests.Audit;
using FleetConsole.Application.Tests.Behaviors;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Application.Tests.Auth;

/// <summary><see cref="GetSessionStateQuery"/>, <see cref="GetCurrentUserQuery"/> and <see cref="LogOutCommand"/>.</summary>
public sealed class SessionAndLogoutHandlerTests
{
    private readonly InMemoryReadModel _readModel = new();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // ---- GetSessionState -------------------------------------------------------------------------------------------

    [Fact]
    public async Task SessionState_ReflectsTheDatabase()
    {
        var admin = AuthTestUsers.LoggedInBefore("ines", "group auditors");
        admin.SetReadOnly(true, activeWritableAdminCount: 5);
        _readModel.UserRows.Add(admin);

        var result = await new GetSessionStateHandler(_readModel).Handle(new GetSessionStateQuery(admin.Id), Ct);

        result.Value.ShouldBe(new SessionStateDto(admin.Id, "ines", UserRole.Admin, IsReadOnly: true, IsActive: true, admin.SecurityStamp));
    }

    [Fact]
    public async Task SessionState_OfDeactivatedUser_IsInactive_WithRotatedStamp()
    {
        var user = AuthTestUsers.PreCreated("carol");
        var stampBefore = user.SecurityStamp;
        user.Deactivate(UserId.New(), 5);
        _readModel.UserRows.Add(user);

        var result = await new GetSessionStateHandler(_readModel).Handle(new GetSessionStateQuery(user.Id), Ct);

        result.Value.IsActive.ShouldBeFalse();
        result.Value.SecurityStamp.ShouldNotBe(stampBefore);
    }

    [Theory]
    [InlineData(false, null)]
    [InlineData(false, "group admins")]
    [InlineData(true, null)]
    [InlineData(true, "user list")]
    public async Task SessionState_Role_MatchesUserRole_ForEveryAdminSourceCombination(bool assigned, string? configurationSource)
    {
        // The handler restates User.Role in its projection (Role isn't mapped); this pins the two together.
        var user = AuthTestUsers.LoggedInBefore("role-check", configurationSource, assignedAdmin: assigned);
        _readModel.UserRows.Add(user);

        var result = await new GetSessionStateHandler(_readModel).Handle(new GetSessionStateQuery(user.Id), Ct);

        result.Value.Role.ShouldBe(user.Role);
        result.Value.Role.ShouldBe(assigned || configurationSource is not null ? UserRole.Admin : UserRole.User);
    }

    [Fact]
    public async Task SessionState_OfUnknownUser_IsUsersNotFound()
    {
        var result = await new GetSessionStateHandler(_readModel).Handle(new GetSessionStateQuery(UserId.New()), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Users.NotFound");
    }

    [Fact]
    public async Task SessionState_RunsWithoutASession()
    {
        // Not IRequireAuthenticated (ADR-0009): it runs during cookie validation, before HttpContext.User is set.
        var user = AuthTestUsers.PreCreated("bob");
        _readModel.UserRows.Add(user);
        await using var provider = ServiceProviderBuilder.Build(services => services.AddScoped<IReadModel>(_ => _readModel));
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new GetSessionStateQuery(user.Id), Ct);

        result.IsSuccess.ShouldBeTrue();
    }

    // ---- GetCurrentUser --------------------------------------------------------------------------------------------

    [Fact]
    public async Task CurrentUser_CombinesSessionRoleWithStoredProfile()
    {
        var user = AuthTestUsers.PreCreated("admin");
        user.RecordLogin("Fleet Admin", ["fleetconsole-admins", "system:authenticated"], "group fleetconsole-admins", false, FixedClock.Now);
        _readModel.UserRows.Add(user);
        var session = new SignedInAs(user.Id, "admin", UserRole.Admin, isReadOnly: true);

        var result = await new GetCurrentUserHandler(session, _readModel).Handle(new GetCurrentUserQuery(), Ct);

        result.Value.ShouldBe(new CurrentUserDto("admin", "Fleet Admin", UserRole.Admin, true, result.Value.Groups, true, "group fleetconsole-admins"));
        result.Value.Groups.ShouldBe(["fleetconsole-admins"], "virtual groups are never shown");
    }

    [Fact]
    public async Task CurrentUser_RoleAndReadOnly_ComeFromTheSession()
    {
        // The database already says Admin (promoted < 60 s ago); the session still says User until revalidation.
        var user = AuthTestUsers.LoggedInBefore("bob", "user list");
        _readModel.UserRows.Add(user);

        var result = await new GetCurrentUserHandler(new SignedInAs(user.Id, "bob", UserRole.User), _readModel)
            .Handle(new GetCurrentUserQuery(), Ct);

        result.Value.Role.ShouldBe(UserRole.User);
        result.Value.IsReadOnly.ShouldBeFalse();
        result.Value.IsAdminViaConfiguration.ShouldBeTrue();
        result.Value.DisplayName.ShouldBe("Old Name");
    }

    [Fact]
    public async Task CurrentUser_WhoseRowIsGone_IsUnauthenticated()
    {
        var result = await new GetCurrentUserHandler(new SignedInAs(UserId.New(), "ghost", UserRole.User), _readModel)
            .Handle(new GetCurrentUserQuery(), Ct);

        result.Error.ShouldBe(AuthErrors.Unauthenticated);
    }

    [Fact]
    public async Task CurrentUser_Anonymous_IsRefusedByThePipeline()
    {
        await using var provider = ServiceProviderBuilder.Build();
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new GetCurrentUserQuery(), Ct);

        result.Error.ShouldBe(AuthErrors.Unauthenticated);
    }

    // ---- LogOut ----------------------------------------------------------------------------------------------------

    [Fact]
    public async Task LogOut_RecordsAuthLogout_WithTheUserAsActor()
    {
        var audit = new RecordingAuditTrail();
        var userId = UserId.New();

        var result = await new LogOutHandler(new SignedInAs(userId, "alice", UserRole.User), audit).Handle(new LogOutCommand(), Ct);

        result.IsSuccess.ShouldBeTrue();
        var record = audit.Single;
        record.Action.ShouldBe("auth.logout");
        record.TargetType.ShouldBe(AuditTargetType.Session);
        record.TargetId.ShouldBe(userId.Value.ToString());
        record.TargetName.ShouldBe("alice");
        record.Actor.ShouldBe(AuditActor.ForUser(userId, "alice"));
        AuditDetails.Of(record).ShouldHaveExactly();
    }

    [Fact]
    public async Task LogOut_ThroughThePipeline_SavesTheEntry_EvenForReadOnlyUsers()
    {
        var unitOfWork = new FakeUnitOfWork();
        var audit = new RecordingAuditTrail();
        await using var provider = ServiceProviderBuilder.Build(
            services =>
            {
                services.AddScoped<ICurrentUser>(_ => new SignedInAs(UserId.New(), "ines", UserRole.Admin, isReadOnly: true));
                services.AddScoped<Application.Audit.IAuditTrail>(_ => audit);
            },
            unitOfWork: unitOfWork);
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new LogOutCommand(), Ct);

        result.IsSuccess.ShouldBeTrue();
        unitOfWork.SaveCount.ShouldBe(1);
        audit.Single.Action.ShouldBe("auth.logout");
    }

    [Fact]
    public async Task LogOut_Anonymous_IsUnauthenticated()
    {
        await using var provider = ServiceProviderBuilder.Build(unitOfWork: new FakeUnitOfWork());
        await using var scope = provider.CreateAsyncScope();

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new LogOutCommand(), Ct);

        result.Error.ShouldBe(AuthErrors.Unauthenticated);
    }
}
