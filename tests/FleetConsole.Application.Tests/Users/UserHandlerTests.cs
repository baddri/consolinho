using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Tests.Audit;
using FleetConsole.Application.Tests.Auth;
using FleetConsole.Application.Users;
using FleetConsole.Application.Users.ChangeUserRole;
using FleetConsole.Application.Users.CreateUser;
using FleetConsole.Application.Users.DeactivateUser;
using FleetConsole.Application.Users.GetUser;
using FleetConsole.Application.Users.ListUsers;
using FleetConsole.Application.Users.ReactivateUser;
using FleetConsole.Application.Users.SetUserReadOnly;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Tests.Users;

/// <summary>
/// The user administration handlers (T-0016) over in-memory fakes: lookup, version check, ADM-5 errors passing through
/// from the aggregate, and the query projections. Grant counts are covered by the integration tests (the in-memory read
/// model has no grants).
/// </summary>
public sealed class UserHandlerTests
{
    private readonly InMemoryUserRepository _users = new();
    private readonly InMemoryReadModel _readModel = new();
    private readonly User _actor = AuthTestUsers.PreCreated("root", UserRole.Admin);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private SignedInAs Actor => new(_actor.Id, "root", UserRole.Admin);

    public UserHandlerTests() => _users.Users.Add(_actor);

    // ---- CreateUser ------------------------------------------------------------------------------------------------

    [Fact]
    public async Task Create_StagesPendingUser_WithActorAsCreator()
    {
        var result = await new CreateUserHandler(_users, Actor, new FixedClock())
            .Handle(new CreateUserCommand("system:serviceaccount:x", UserRole.Admin, IsReadOnly: true), Ct);

        result.Value.ShouldBe("system:serviceaccount:x");
        var added = _users.Added.ShouldHaveSingleItem();
        added.CreatedBy.ShouldBe("root");
        added.CreatedAt.ShouldBe(FixedClock.Now);
        added.IsAdminByAssignment.ShouldBeTrue();
        added.IsReadOnly.ShouldBeTrue();
        added.Status.ShouldBe(UserStatus.Pending);
    }

    [Fact]
    public async Task Create_TakenUsername_IsUsernameTaken()
    {
        _users.Users.Add(AuthTestUsers.PreCreated("carol"));

        var result = await new CreateUserHandler(_users, Actor, new FixedClock())
            .Handle(new CreateUserCommand("carol", UserRole.User, IsReadOnly: false), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Users.UsernameTaken");
        _users.Added.ShouldBeEmpty();
    }

    [Fact]
    public async Task Create_UsernameDiffersOnlyInCase_IsAnotherUser()
    {
        _users.Users.Add(AuthTestUsers.PreCreated("carol"));

        var result = await new CreateUserHandler(_users, Actor, new FixedClock())
            .Handle(new CreateUserCommand("Carol", UserRole.User, IsReadOnly: false), Ct);

        result.IsSuccess.ShouldBeTrue();
    }

    // ---- Transitions: lookup and version ---------------------------------------------------------------------------

    [Theory]
    [InlineData("nobody")]
    [InlineData("..")] // not a valid username, so it can't name a user: 404, not 400
    public async Task Transition_UnknownUser_IsNotFound(string username)
    {
        var result = await new ReactivateUserHandler(_users).Handle(new ReactivateUserCommand(username, 0), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Users.NotFound");
        result.Error!.Type.ShouldBe(ErrorType.NotFound);
    }

    [Fact]
    public async Task Transition_StaleVersion_IsConcurrencyConflict_BeforeAnyRule()
    {
        // Self-deactivation would be SelfChange; the stale version wins so the client reloads first.
        var result = await new DeactivateUserHandler(_users, Actor)
            .Handle(new DeactivateUserCommand("root", _actor.Version + 1), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Concurrency.Conflict");
        result.Error!.Message.ShouldBe("This user was changed by someone else. Reload and try again.");
        _actor.IsDeactivated.ShouldBeFalse();
    }

    // ---- Transitions: aggregate rules pass through -----------------------------------------------------------------

    [Fact]
    public async Task ChangeRole_PromotesAndReturnsUsername()
    {
        var carol = AddUser("carol");

        var result = await new ChangeUserRoleHandler(_users, Actor)
            .Handle(new ChangeUserRoleCommand("carol", UserRole.Admin, carol.Version), Ct);

        result.Value.ShouldBe("carol");
        carol.IsAdminByAssignment.ShouldBeTrue();
    }

    [Fact]
    public async Task ChangeRole_DemoteSelf_IsSelfChange()
    {
        AddUser("second-admin", UserRole.Admin);

        var result = await new ChangeUserRoleHandler(_users, Actor)
            .Handle(new ChangeUserRoleCommand("root", UserRole.User, _actor.Version), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Users.SelfChange");
    }

    [Fact]
    public async Task ChangeRole_DemoteConfigurationAdmin_IsAdminViaConfiguration()
    {
        var configAdmin = AuthTestUsers.LoggedInBefore("ines", AdminConfigurationSource.ForGroup("fleetconsole-admins"));
        _users.Users.Add(configAdmin);

        var result = await new ChangeUserRoleHandler(_users, Actor)
            .Handle(new ChangeUserRoleCommand("ines", UserRole.User, configAdmin.Version), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Users.AdminViaConfiguration");
    }

    [Fact]
    public async Task Deactivate_LastWritableAdmin_IsLastAdmin()
    {
        // The actor's session still says admin, but the database counts only the target as active writable admin.
        _actor.SetReadOnly(true, activeWritableAdminCount: 2).IsSuccess.ShouldBeTrue();
        var target = AddUser("other-admin", UserRole.Admin);

        var result = await new DeactivateUserHandler(_users, Actor)
            .Handle(new DeactivateUserCommand("other-admin", target.Version), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Users.LastAdmin");
        target.IsDeactivated.ShouldBeFalse();
    }

    [Fact]
    public async Task SetReadOnly_OnlyWritableAdminOnSelf_IsLastAdmin()
    {
        var result = await new SetUserReadOnlyHandler(_users)
            .Handle(new SetUserReadOnlyCommand("root", IsReadOnly: true, _actor.Version), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Users.LastAdmin");
    }

    [Fact]
    public async Task DeactivateThenReactivate_ChangesStatus()
    {
        var carol = AddUser("carol");

        (await new DeactivateUserHandler(_users, Actor).Handle(new DeactivateUserCommand("carol", carol.Version), Ct))
            .Value.ShouldBe("carol");
        carol.IsDeactivated.ShouldBeTrue();

        (await new ReactivateUserHandler(_users).Handle(new ReactivateUserCommand("carol", carol.Version), Ct))
            .Value.ShouldBe("carol");
        carol.IsDeactivated.ShouldBeFalse();
    }

    [Fact]
    public async Task Transition_Anonymous_IsUnauthenticated()
    {
        var result = await new DeactivateUserHandler(_users, FakeCurrentUser.Anonymous)
            .Handle(new DeactivateUserCommand("root", 0), Ct);

        result.Error.ShouldBe(AuthErrors.Unauthenticated);
    }

    // ---- Queries ---------------------------------------------------------------------------------------------------

    [Fact]
    public async Task GetUser_ProjectsDerivedValues_AndHidesVirtualGroups()
    {
        var ines = AuthTestUsers.LoggedInBefore("ines", AdminConfigurationSource.ForGroup("fleetconsole-admins"));
        ines.RecordLogin("Ines", ["ops", "system:authenticated"], AdminConfigurationSource.ForGroup("fleetconsole-admins"), provisioned: false, FixedClock.Now)
            .IsSuccess.ShouldBeTrue();
        _readModel.UserRows.Add(ines);

        var result = await new GetUserHandler(_readModel).Handle(new GetUserQuery("ines"), Ct);

        var dto = result.Value;
        dto.Role.ShouldBe(UserRole.Admin);
        dto.IsAdminViaConfiguration.ShouldBeTrue();
        dto.IsAdminByAssignment.ShouldBeFalse();
        dto.AdminConfigurationSource.ShouldBe(new AdminConfigurationSourceDto(AdminConfigurationSourceKind.Group, "fleetconsole-admins"));
        dto.Status.ShouldBe(UserStatus.Active);
        dto.Groups.ShouldBe(["ops"]);
        dto.CreatedBy.ShouldBe("root");
        dto.GrantCount.ShouldBe(0);
    }

    [Theory]
    [InlineData("nobody")]
    [InlineData("a/b")]
    public async Task GetUser_Unknown_IsNotFound(string username)
    {
        var result = await new GetUserHandler(_readModel).Handle(new GetUserQuery(username), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Users.NotFound");
    }

    [Fact]
    public async Task ListUsers_SortsOrdinally_WithStatuses()
    {
        _readModel.UserRows.Add(AuthTestUsers.PreCreated("bob"));
        _readModel.UserRows.Add(AuthTestUsers.Deactivated("Zed"));
        _readModel.UserRows.Add(AuthTestUsers.LoggedInBefore("alice", adminSource: null, assignedAdmin: true));

        var result = await new ListUsersHandler(_readModel).Handle(new ListUsersQuery(), Ct);

        result.Value.Select(u => u.Username).ShouldBe(["Zed", "alice", "bob"]);
        result.Value.Select(u => u.Status).ShouldBe([UserStatus.Deactivated, UserStatus.Active, UserStatus.Pending]);
        result.Value[1].Role.ShouldBe(UserRole.Admin);
        result.Value[1].IsAdminByAssignment.ShouldBeTrue();
    }

    private User AddUser(string username, UserRole role = UserRole.User)
    {
        var user = AuthTestUsers.PreCreated(username, role);
        _users.Users.Add(user);
        return user;
    }
}
