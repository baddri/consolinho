using FleetConsole.Application.Audit;
using FleetConsole.Application.Audit.EventHandlers;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Access.Events;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Tests.Audit;

public sealed class GrantAuditHandlerTests
{
    private static readonly GrantId Id = GrantId.New();
    private static readonly UserId Alice = UserId.New();
    private static readonly ClusterId Cluster = ClusterId.New();
    private static readonly CredentialId View = CredentialId.New();
    private static readonly CredentialId Edit = CredentialId.New();

    private readonly RecordingAuditTrail _trail = new();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private GrantAuditHandler Handler => new(_trail);

    [Fact]
    public async Task GrantCreated_RecordsUserModeAndCredential()
    {
        await Handler.Handle(new GrantCreated(Id, Alice, "alice", Cluster, "prod-eu-1", View, "fleet-view", AccessMode.ReadOnly, GrantSubjectKind.User, null), Ct);

        var record = ShouldBeGrantEntry("grant.created");
        record.Summary.ShouldBe("Granted alice ReadOnly on prod-eu-1 via fleet-view");
        var details = AuditDetails.Of(record).ShouldHaveExactly("username", "accessMode", "credential");
        details.Str("username").ShouldBe("alice");
        details.Str("accessMode").ShouldBe("readOnly");
        details.Str("credential").ShouldBe("fleet-view");
    }

    [Fact]
    public async Task GrantChanged_RecordsOldAndNewModeAndCredential()
    {
        await Handler.Handle(
            new GrantChanged(Id, Alice, "alice", Cluster, "prod-eu-1", AccessMode.ReadOnly, AccessMode.ReadWrite, View, "fleet-view", Edit, "fleet-edit", GrantSubjectKind.User, null, null),
            Ct);

        var details = AuditDetails.Of(ShouldBeGrantEntry("grant.changed"))
            .ShouldHaveExactly("oldAccessMode", "newAccessMode", "oldCredential", "newCredential");
        details.Str("oldAccessMode").ShouldBe("readOnly");
        details.Str("newAccessMode").ShouldBe("readWrite");
        details.Str("oldCredential").ShouldBe("fleet-view");
        details.Str("newCredential").ShouldBe("fleet-edit");
    }

    [Fact]
    public async Task GrantRevoked_RecordsWhatTheGrantWas()
    {
        await Handler.Handle(new GrantRevoked(Id, Alice, "alice", Cluster, "prod-eu-1", Edit, "fleet-edit", AccessMode.ReadWrite, GrantSubjectKind.User, null), Ct);

        var record = ShouldBeGrantEntry("grant.revoked");
        record.Summary.ShouldContain("Revoked alice");
        var details = AuditDetails.Of(record).ShouldHaveExactly("username", "accessMode", "credential");
        details.Str("accessMode").ShouldBe("readWrite");
        details.Str("credential").ShouldBe("fleet-edit");
    }

    [Fact]
    public async Task GroupGrantCreated_RecordsKindGroupAndPriority()
    {
        await Handler.Handle(
            new GrantCreated(Id, null, "sre-emea", Cluster, "prod-eu-1", View, "sa-view", AccessMode.ReadOnly, GrantSubjectKind.Group, 50), Ct);

        var record = ShouldBeGroupGrantEntry("grant.created");
        record.Summary.ShouldBe("Granted group sre-emea ReadOnly on prod-eu-1 via sa-view (priority 50)");
        var details = AuditDetails.Of(record).ShouldHaveExactly("subjectKind", "groupName", "priority", "accessMode", "credential");
        details.Str("subjectKind").ShouldBe("group");
        details.Str("groupName").ShouldBe("sre-emea");
        details.GetProperty("priority").GetInt32().ShouldBe(50);
        details.Str("credential").ShouldBe("sa-view");
    }

    [Fact]
    public async Task GroupGrantChanged_RecordsOldAndNewPriority()
    {
        await Handler.Handle(
            new GrantChanged(Id, null, "sre-emea", Cluster, "prod-eu-1", AccessMode.ReadOnly, AccessMode.ReadWrite, View, "fleet-view",
                Edit, "fleet-edit", GrantSubjectKind.Group, 50, 60),
            Ct);

        var record = ShouldBeGroupGrantEntry("grant.changed");
        record.Summary.ShouldContain("group sre-emea");
        var details = AuditDetails.Of(record).ShouldHaveExactly(
            "subjectKind", "groupName", "oldPriority", "newPriority", "oldAccessMode", "newAccessMode", "oldCredential", "newCredential");
        details.Str("subjectKind").ShouldBe("group");
        details.GetProperty("oldPriority").GetInt32().ShouldBe(50);
        details.GetProperty("newPriority").GetInt32().ShouldBe(60);
    }

    [Fact]
    public async Task GroupGrantRevoked_RecordsKindGroupAndPriority()
    {
        await Handler.Handle(
            new GrantRevoked(Id, null, "sre-emea", Cluster, "prod-eu-1", Edit, "fleet-edit", AccessMode.ReadWrite, GrantSubjectKind.Group, 50), Ct);

        var record = ShouldBeGroupGrantEntry("grant.revoked");
        record.Summary.ShouldBe("Revoked group sre-emea's ReadWrite access to prod-eu-1 (priority 50)");
        var details = AuditDetails.Of(record).ShouldHaveExactly("subjectKind", "groupName", "priority", "accessMode", "credential");
        details.Str("groupName").ShouldBe("sre-emea");
        details.GetProperty("priority").GetInt32().ShouldBe(50);
    }

    /// <summary>Group grant entries: "group X → cluster" target (found by the target filter), no related user.</summary>
    private AuditRecord ShouldBeGroupGrantEntry(string action)
    {
        var record = _trail.Single;
        record.Action.ShouldBe(action);
        record.TargetType.ShouldBe(AuditTargetType.Grant);
        record.TargetId.ShouldBe(Id.Value.ToString());
        record.TargetName.ShouldBe("group sre-emea → prod-eu-1");
        record.TargetName.ShouldContain("sre-emea");
        record.ClusterName.ShouldBe("prod-eu-1");
        record.Actor.ShouldBeNull("grant actions are attributed to the current user");
        record.RelatedUsername.ShouldBeNull();
        return record;
    }

    /// <summary>Shared by every <c>grant.*</c> entry: "user → cluster" target, cluster set, related username = the user.</summary>
    private AuditRecord ShouldBeGrantEntry(string action)
    {
        var record = _trail.Single;
        record.Action.ShouldBe(action);
        record.TargetType.ShouldBe(AuditTargetType.Grant);
        record.TargetId.ShouldBe(Id.Value.ToString());
        record.TargetName.ShouldBe("alice → prod-eu-1");
        record.ClusterName.ShouldBe("prod-eu-1");
        record.Actor.ShouldBeNull("grant actions are attributed to the current user");
        record.RelatedUsername.ShouldBe("alice");
        return record;
    }
}
