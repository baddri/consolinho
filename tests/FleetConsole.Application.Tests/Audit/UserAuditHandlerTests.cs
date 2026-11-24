using System.Text.Json;
using FleetConsole.Application.Audit;
using FleetConsole.Application.Audit.EventHandlers;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Users;
using FleetConsole.Domain.Users.Events;

namespace FleetConsole.Application.Tests.Audit;

public sealed class UserAuditHandlerTests
{
    private static readonly UserId BobId = UserId.New();

    private readonly RecordingAuditTrail _trail = new();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private UserAuditHandler Handler => new(_trail);

    [Fact]
    public async Task UserLoggedIn_IsAuthLogin_ByTheUser_OnTheSession()
    {
        await Handler.Handle(new UserLoggedIn(BobId, "bob", ["devs", "ops"], Provisioned: true), Ct);

        var record = _trail.Single;
        record.Action.ShouldBe("auth.login");
        record.TargetType.ShouldBe(AuditTargetType.Session);
        record.TargetName.ShouldBe("bob");
        record.ClusterName.ShouldBeNull();
        record.Actor.ShouldBe(AuditActor.ForUser(BobId, "bob"));
        record.RelatedUsername.ShouldBeNull("auth.* entries are not user.* entries");
        record.Summary.ShouldBe("bob logged in");

        var details = AuditDetails.Of(record).ShouldHaveExactly("groups", "provisioned");
        details.GetProperty("groups").EnumerateArray().Select(g => g.GetString()).ShouldBe(["devs", "ops"]);
        details.GetProperty("provisioned").GetBoolean().ShouldBeTrue();
    }

    [Fact]
    public async Task UserProvisioned_IsAttributedToTheUser()
    {
        await Handler.Handle(new UserProvisioned(BobId, "bob"), Ct);

        var record = ShouldBeUserEntry("user.provisioned");
        record.Actor.ShouldBe(AuditActor.ForUser(BobId, "bob"));
        AuditDetails.Of(record).ShouldHaveExactly("source").Str("source").ShouldBe("login");
    }

    [Fact]
    public async Task UserCreated_IsByTheCurrentUser_WithRoleAndReadOnly()
    {
        await Handler.Handle(new UserCreated(BobId, "bob", UserRole.User, IsReadOnly: false), Ct);

        var record = ShouldBeUserEntry("user.created");
        record.Actor.ShouldBeNull("null = the current user (the admin)");
        record.Summary.ShouldBe("Created user bob");
        var details = AuditDetails.Of(record).ShouldHaveExactly("role", "isReadOnly");
        details.Str("role").ShouldBe("user");
        details.GetProperty("isReadOnly").GetBoolean().ShouldBeFalse();
    }

    [Fact]
    public async Task ManualPromotion_IsUserPromoted_ByTheCurrentUser()
    {
        await Handler.Handle(new UserRoleChanged(BobId, "bob", UserRole.User, UserRole.Admin, RoleChangeSource.Manual, null), Ct);

        var record = ShouldBeUserEntry("user.promoted");
        record.Actor.ShouldBeNull();
        var details = AuditDetails.Of(record).ShouldHaveExactly("source", "configurationSource");
        details.Str("source").ShouldBe("manual");
        details.IsNull("configurationSource").ShouldBeTrue();
    }

    [Fact]
    public async Task PromotingAConfigurationAdmin_AdminToAdmin_IsStillUserPromoted()
    {
        // ADR-0017: the action follows NewRole; OldRole == NewRole here.
        await Handler.Handle(
            new UserRoleChanged(BobId, "bob", UserRole.Admin, UserRole.Admin, RoleChangeSource.Manual, "group fleetconsole-admins"),
            Ct);

        var record = ShouldBeUserEntry("user.promoted");
        record.Actor.ShouldBeNull();
        AuditDetails.Of(record).Str("configurationSource").ShouldBe("group fleetconsole-admins");
    }

    [Fact]
    public async Task ManualDemotion_IsUserDemoted()
    {
        await Handler.Handle(new UserRoleChanged(BobId, "bob", UserRole.Admin, UserRole.User, RoleChangeSource.Manual, null), Ct);

        var record = ShouldBeUserEntry("user.demoted");
        record.Actor.ShouldBeNull();
        record.Summary.ShouldBe("Demoted bob to user");
    }

    [Theory]
    [InlineData(UserRole.Admin, "user.promoted")]
    [InlineData(UserRole.User, "user.demoted")]
    public async Task ConfigurationRoleChange_IsBySystemConfig(UserRole newRole, string action)
    {
        var oldRole = newRole == UserRole.Admin ? UserRole.User : UserRole.Admin;

        await Handler.Handle(
            new UserRoleChanged(BobId, "bob", oldRole, newRole, RoleChangeSource.Configuration, "group fleetconsole-admins"), Ct);

        var record = ShouldBeUserEntry(action);
        record.Actor.ShouldBe(AuditActor.Configuration);
        record.Summary.ShouldContain("group fleetconsole-admins");
        var details = AuditDetails.Of(record).ShouldHaveExactly("source", "configurationSource");
        details.Str("source").ShouldBe("configuration");
        details.Str("configurationSource").ShouldBe("group fleetconsole-admins");
    }

    [Fact]
    public async Task UserDeactivated_HasEmptyDetails()
    {
        await Handler.Handle(new UserDeactivated(BobId, "bob"), Ct);

        var record = ShouldBeUserEntry("user.deactivated");
        record.Actor.ShouldBeNull();
        record.Summary.ShouldBe("Deactivated user bob");
        AuditDetails.Of(record).ShouldHaveExactly();
    }

    [Fact]
    public async Task UserReactivated_HasEmptyDetails()
    {
        await Handler.Handle(new UserReactivated(BobId, "bob"), Ct);

        var record = ShouldBeUserEntry("user.reactivated");
        record.Actor.ShouldBeNull();
        AuditDetails.Of(record).ShouldHaveExactly();
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task UserReadOnlyChanged_RecordsTheNewFlag(bool isReadOnly)
    {
        await Handler.Handle(new UserReadOnlyChanged(BobId, "bob", isReadOnly), Ct);

        var record = ShouldBeUserEntry("user.read_only_changed");
        record.Actor.ShouldBeNull();
        AuditDetails.Of(record).ShouldHaveExactly("isReadOnly").GetProperty("isReadOnly").GetBoolean().ShouldBe(isReadOnly);
    }

    [Fact]
    public async Task GroupsChanged_IsBySystemRevalidation_WithAddedAndRemoved()
    {
        await Handler.Handle(new UserGroupsChanged(BobId, "bob", ["dba"], ["sre", "ops"]), Ct);

        var record = ShouldBeUserEntry("user.groups_changed");
        record.Actor.ShouldBe(AuditActor.Revalidation);
        record.Actor!.Name.ShouldBe("system (revalidation)");
        var details = AuditDetails.Of(record).ShouldHaveExactly("added", "removed");
        details.GetProperty("added").EnumerateArray().Select(e => e.GetString()).ShouldBe(["dba"]);
        details.GetProperty("removed").EnumerateArray().Select(e => e.GetString()).ShouldBe(["sre", "ops"]);
    }

    /// <summary>The fields every <c>user.*</c> entry shares: user target, no cluster, related username = the user.</summary>
    private AuditRecord ShouldBeUserEntry(string action)
    {
        var record = _trail.Single;
        record.Action.ShouldBe(action);
        record.TargetType.ShouldBe(AuditTargetType.User);
        record.TargetId.ShouldBe(BobId.Value.ToString());
        record.TargetName.ShouldBe("bob");
        record.ClusterName.ShouldBeNull();
        record.RelatedUsername.ShouldBe("bob");
        record.Summary.ShouldContain("bob");
        AuditDetails.Of(record).ValueKind.ShouldBe(JsonValueKind.Object);
        return record;
    }
}
