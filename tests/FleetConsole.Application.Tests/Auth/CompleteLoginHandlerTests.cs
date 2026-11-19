using FleetConsole.Application.Auth;
using FleetConsole.Application.Auth.CompleteLogin;
using FleetConsole.Application.Tests.Audit;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Users;
using FleetConsole.Domain.Users.Events;
using Microsoft.Extensions.Options;

namespace FleetConsole.Application.Tests.Auth;

/// <summary>
/// <see cref="CompleteLoginHandler"/> with in-memory fakes (no EF): AUTH-5 provisioning, AUTH-6 not registered,
/// AUTH-7 deactivated, AUTH-8 configuration admins (Q8), virtual group filtering.
/// </summary>
public sealed class CompleteLoginHandlerTests
{
    private readonly InMemoryUserRepository _users = new();
    private readonly RecordingAuditTrail _audit = new();
    private readonly AuthOptions _options = new();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<LoginOutcomeDto> LoginAsync(string username, string? fullName = "Alice Example", params string[] groups)
    {
        var handler = new CompleteLoginHandler(_users, _audit, new FixedClock(), Options.Create(_options));
        var result = await handler.Handle(new CompleteLoginCommand(new ExternalIdentity(username, fullName, groups)), Ct);
        result.IsSuccess.ShouldBeTrue("denied logins are successful outcomes too (ADR-0008 §4)");
        return result.Value;
    }

    // ---- AUTH-5 provisioning ---------------------------------------------------------------------------------------

    [Fact]
    public async Task UnknownUser_WithAutoProvision_IsProvisionedAndAllowed()
    {
        var outcome = await LoginAsync("alice", "Alice Example", "sre", "system:authenticated", "system:authenticated:oauth");

        outcome.Decision.ShouldBe(LoginDecision.Allowed);
        var user = _users.Added.ShouldHaveSingleItem();
        outcome.User.ShouldBe(new SignedInUserDto(user.Id, "alice", UserRole.User, false, user.SecurityStamp));
        user.CreatedBy.ShouldBe("alice");
        user.DisplayName.ShouldBe("Alice Example");
        user.LastLoginAt.ShouldBe(FixedClock.Now);
        user.Groups.ShouldBe(["sre"], "virtual system:* groups are dropped before storing");

        user.DomainEvents.OfType<UserProvisioned>().ShouldHaveSingleItem().Username.ShouldBe("alice");
        var login = user.DomainEvents.OfType<UserLoggedIn>().ShouldHaveSingleItem();
        login.Provisioned.ShouldBeTrue();
        login.Groups.ShouldBe(["sre"]);
        _audit.Records.ShouldBeEmpty("allowed logins are audited through the domain events");
    }

    [Fact]
    public async Task ProvisionedUser_InAdminGroup_BecomesConfigurationAdmin()
    {
        _options.AdminGroups.Add("fleetconsole-admins");

        var outcome = await LoginAsync("admin", "Fleet Admin", "fleetconsole-admins", "system:authenticated");

        outcome.User.ShouldNotBeNull().Role.ShouldBe(UserRole.Admin);
        var user = _users.Added.ShouldHaveSingleItem();
        user.AdminConfigurationSource.ShouldBe("group fleetconsole-admins");
        user.IsAdminByAssignment.ShouldBeFalse();
        var change = user.DomainEvents.OfType<UserRoleChanged>().ShouldHaveSingleItem();
        change.Source.ShouldBe(RoleChangeSource.Configuration);
        change.ConfigurationSource.ShouldBe("group fleetconsole-admins");
    }

    // ---- AUTH-6 not registered ---------------------------------------------------------------------------------------

    [Fact]
    public async Task UnknownUser_WithoutAutoProvision_IsNotRegistered_AndDenialIsAudited()
    {
        _options.AutoProvision = false;

        var outcome = await LoginAsync("mallory");

        outcome.ShouldBe(new LoginOutcomeDto(LoginDecision.NotRegistered, null));
        _users.Added.ShouldBeEmpty();
        var record = _audit.Single;
        record.Action.ShouldBe("auth.login_denied");
        record.TargetType.ShouldBe(AuditTargetType.Session);
        record.TargetId.ShouldBeNull();
        record.TargetName.ShouldBe("mallory");
        record.Actor.ShouldBe(AuditActor.Anonymous("mallory"));
        AuditDetails.Of(record).ShouldHaveExactly("reason").Str("reason").ShouldBe("notRegistered");
    }

    [Fact]
    public async Task PreCreatedUser_WithoutAutoProvision_LogsIn()
    {
        _options.AutoProvision = false;
        var bob = AuthTestUsers.PreCreated("bob", UserRole.Admin, isReadOnly: true);
        _users.Users.Add(bob);

        var outcome = await LoginAsync("bob", fullName: null);

        outcome.Decision.ShouldBe(LoginDecision.Allowed);
        outcome.User.ShouldBe(new SignedInUserDto(bob.Id, "bob", UserRole.Admin, true, bob.SecurityStamp));
        bob.Status.ShouldBe(UserStatus.Active);
        bob.DisplayName.ShouldBeNull();
        bob.DomainEvents.OfType<UserLoggedIn>().ShouldHaveSingleItem().Provisioned.ShouldBeFalse();
        bob.DomainEvents.OfType<UserProvisioned>().ShouldBeEmpty();
        _audit.Records.ShouldBeEmpty();
    }

    [Theory]
    [InlineData("")]
    [InlineData("a/b")]
    [InlineData("~")]
    public async Task UnusableUsername_IsNotRegistered_EvenWithAutoProvision(string username)
    {
        var outcome = await LoginAsync(username);

        outcome.Decision.ShouldBe(LoginDecision.NotRegistered);
        _users.Added.ShouldBeEmpty();
        var record = _audit.Single;
        record.Action.ShouldBe("auth.login_denied");
        record.TargetName.ShouldNotBeNullOrWhiteSpace();
        record.Actor.ShouldNotBeNull().UserId.ShouldBeNull();
    }

    // ---- AUTH-7 deactivated ----------------------------------------------------------------------------------------

    [Fact]
    public async Task DeactivatedUser_IsDenied_AndDenialIsAuditedWithTheUserAsActor()
    {
        var carol = AuthTestUsers.Deactivated("carol");
        _users.Users.Add(carol);

        var outcome = await LoginAsync("carol");

        outcome.ShouldBe(new LoginOutcomeDto(LoginDecision.Deactivated, null));
        carol.DomainEvents.ShouldBeEmpty("nothing about the user changes");
        carol.LastLoginAt.ShouldBeNull();
        var record = _audit.Single;
        record.Action.ShouldBe("auth.login_denied");
        record.TargetId.ShouldBe(carol.Id.Value.ToString());
        record.TargetName.ShouldBe("carol");
        record.Actor.ShouldBe(AuditActor.ForUser(carol.Id, "carol"));
        AuditDetails.Of(record).ShouldHaveExactly("reason").Str("reason").ShouldBe("deactivated");
    }

    // ---- AUTH-8 configuration admins (ADR-0009, Q8) ----------------------------------------------------------------

    [Fact]
    public async Task BootstrapUser_BecomesAdmin_WithUserListSource()
    {
        _options.BootstrapAdminUsers.Add("dave");
        _options.AdminGroups.Add("fleetconsole-admins");
        var dave = AuthTestUsers.LoggedInBefore("dave", adminSource: null);
        _users.Users.Add(dave);

        var outcome = await LoginAsync("dave", "Dave", "fleetconsole-admins");

        outcome.User.ShouldNotBeNull().Role.ShouldBe(UserRole.Admin);
        dave.AdminConfigurationSource.ShouldBe("user list", "the user list wins over groups");
        var change = dave.DomainEvents.OfType<UserRoleChanged>().ShouldHaveSingleItem();
        change.OldRole.ShouldBe(UserRole.User);
        change.NewRole.ShouldBe(UserRole.Admin);
        change.Source.ShouldBe(RoleChangeSource.Configuration);
    }

    [Fact]
    public async Task ConfigurationAdmin_StillInGroup_RaisesNoRoleChange()
    {
        _options.AdminGroups.Add("fleetconsole-admins");
        var erin = AuthTestUsers.LoggedInBefore("erin", "group fleetconsole-admins");
        _users.Users.Add(erin);

        var outcome = await LoginAsync("erin", "Erin", "fleetconsole-admins");

        outcome.User.ShouldNotBeNull().Role.ShouldBe(UserRole.Admin);
        erin.DomainEvents.OfType<UserRoleChanged>().ShouldBeEmpty();
        erin.DomainEvents.OfType<UserLoggedIn>().ShouldHaveSingleItem();
    }

    [Fact]
    public async Task ConfigurationAdmin_RemovedFromGroup_IsBackToUser()
    {
        _options.AdminGroups.Add("fleetconsole-admins");
        var frank = AuthTestUsers.LoggedInBefore("frank", "group fleetconsole-admins");
        _users.Users.Add(frank);

        var outcome = await LoginAsync("frank", "Frank", "sre");

        outcome.User.ShouldNotBeNull().Role.ShouldBe(UserRole.User);
        frank.AdminConfigurationSource.ShouldBeNull();
        var change = frank.DomainEvents.OfType<UserRoleChanged>().ShouldHaveSingleItem();
        change.NewRole.ShouldBe(UserRole.User);
        change.Source.ShouldBe(RoleChangeSource.Configuration);
        change.ConfigurationSource.ShouldBe("group fleetconsole-admins", "the former source is reported on demotion");
    }

    [Fact]
    public async Task AssignedAdmin_RemovedFromGroup_StaysAdmin_WithoutRoleChange()
    {
        _options.AdminGroups.Add("fleetconsole-admins");
        var grace = AuthTestUsers.LoggedInBefore("grace", "group fleetconsole-admins", assignedAdmin: true);
        _users.Users.Add(grace);

        var outcome = await LoginAsync("grace", "Grace", "sre");

        outcome.User.ShouldNotBeNull().Role.ShouldBe(UserRole.Admin);
        grace.AdminConfigurationSource.ShouldBeNull();
        grace.DomainEvents.OfType<UserRoleChanged>().ShouldBeEmpty("the effective role did not change");
    }

    [Fact]
    public async Task VirtualGroups_NeverMakeAnyoneAdmin()
    {
        // Validation refuses such configuration; the handler must not depend on it.
        _options.AdminGroups.Add("system:authenticated");

        var outcome = await LoginAsync("henry", "Henry", "system:authenticated");

        outcome.User.ShouldNotBeNull().Role.ShouldBe(UserRole.User);
    }

    [Fact]
    public void Command_ToString_CarriesNoSecretMaterial()
    {
        // The command has no token property at all; its generated ToString is what LoggingBehavior could ever see.
        typeof(CompleteLoginCommand).GetProperties().Select(p => p.PropertyType).ShouldBe([typeof(ExternalIdentity)]);
        typeof(ExternalIdentity).GetProperties().Select(p => p.Name).ShouldBe(["Username", "FullName", "Groups"], ignoreOrder: true);
    }
}
