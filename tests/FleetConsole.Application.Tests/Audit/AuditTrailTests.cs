using System.Diagnostics;
using System.Text.Json;
using FleetConsole.Application.Audit;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Tests.Audit;

public sealed class AuditTrailTests
{
    private static readonly AuditRecord DeactivateBob = new(
        "user.deactivated",
        AuditTargetType.User,
        "b0b",
        "bob",
        ClusterName: null,
        "Deactivated user bob",
        RelatedUsername: "bob");

    [Fact]
    public void Record_ComposesTheEntry_FromTheRecordCurrentUserAndClock()
    {
        var admin = FakeCurrentUser.SignedIn(UserRole.Admin, username: "alice");
        var repository = new CapturingAuditEntryRepository();
        var trail = new AuditTrail(admin, new FixedClock(), repository);

        trail.Record(DeactivateBob with { ClusterName = "prod-eu-1" });

        var entry = repository.Entries.ShouldHaveSingleItem();
        entry.Actor.ShouldBe(AuditActor.ForUser(admin.UserId!.Value, "alice"));
        entry.Action.ShouldBe("user.deactivated");
        entry.Category.ShouldBe(AuditCategory.Users);
        entry.TargetType.ShouldBe(AuditTargetType.User);
        entry.TargetId.ShouldBe("b0b");
        entry.TargetName.ShouldBe("bob");
        entry.ClusterName.ShouldBe("prod-eu-1");
        entry.Summary.ShouldBe("Deactivated user bob");
        entry.RelatedUsername.ShouldBe("bob");
        entry.OccurredAt.ShouldBe(FixedClock.Now);
        entry.DetailsJson.ShouldBe("{}");
    }

    [Fact]
    public void Record_PrefersTheExplicitActor()
    {
        var repository = new CapturingAuditEntryRepository();
        var trail = new AuditTrail(FakeCurrentUser.SignedIn(UserRole.Admin), new FixedClock(), repository);

        trail.Record(DeactivateBob with { Actor = AuditActor.Configuration });

        var actor = repository.Entries.ShouldHaveSingleItem().Actor;
        actor.ShouldBe(AuditActor.Configuration);
        actor.ShouldNotBeSameAs(AuditActor.Configuration, "each entry owns its actor value (EF owned type)");
    }

    [Fact]
    public void Record_WithExplicitActor_WorksWithoutAnAuthenticatedUser()
    {
        // The login handler records before the session exists: the actor is passed explicitly.
        var repository = new CapturingAuditEntryRepository();
        var trail = new AuditTrail(FakeCurrentUser.Anonymous, new FixedClock(), repository);
        var actor = AuditActor.ForUser(UserId.New(), "carol");

        trail.Record(DeactivateBob with { Actor = actor });

        repository.Entries.ShouldHaveSingleItem().Actor.ShouldBe(actor);
    }

    [Fact]
    public void Record_WithoutActorOrAuthenticatedUser_Throws()
    {
        var repository = new CapturingAuditEntryRepository();
        var trail = new AuditTrail(FakeCurrentUser.Anonymous, new FixedClock(), repository);

        Should.Throw<InvalidOperationException>(() => trail.Record(DeactivateBob)).Message.ShouldContain("user.deactivated");
        repository.Entries.ShouldBeEmpty();
    }

    [Fact]
    public void Record_WithoutRelatedUsername_StoresNull()
    {
        var repository = new CapturingAuditEntryRepository();
        var trail = new AuditTrail(FakeCurrentUser.SignedIn(UserRole.Admin), new FixedClock(), repository);

        trail.Record(new AuditRecord("cluster.enabled", AuditTargetType.Cluster, null, "prod", "prod", "Enabled cluster prod"));

        repository.Entries.ShouldHaveSingleItem().RelatedUsername.ShouldBeNull();
    }

    [Fact]
    public void Record_TakesTheCorrelationIdFromTheCurrentActivity()
    {
        using var activity = new Activity("test").SetIdFormat(ActivityIdFormat.W3C).Start();
        var repository = new CapturingAuditEntryRepository();
        var trail = new AuditTrail(FakeCurrentUser.SignedIn(UserRole.Admin), new FixedClock(), repository);

        trail.Record(DeactivateBob);

        var correlationId = repository.Entries.ShouldHaveSingleItem().CorrelationId;
        correlationId.ShouldBe(activity.TraceId.ToHexString());
        correlationId!.Length.ShouldBe(32);
    }

    [Fact]
    public void Record_WithoutActivity_HasNoCorrelationId()
    {
        Activity.Current = null;
        var repository = new CapturingAuditEntryRepository();
        var trail = new AuditTrail(FakeCurrentUser.SignedIn(UserRole.Admin), new FixedClock(), repository);

        trail.Record(DeactivateBob);

        repository.Entries.ShouldHaveSingleItem().CorrelationId.ShouldBeNull();
    }

    [Fact]
    public void SerializeDetails_UsesCamelCaseNamesAndEnumStrings_AndKeepsNulls()
    {
        var json = AuditTrail.SerializeDetails(new
        {
            TokenType = TokenType.Opaque,
            FailedStep = (ConnectionTestStep?)ConnectionTestStep.OpenShiftVersion,
            Headline = (CapabilityLevel?)null,
        });

        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        root.GetProperty("tokenType").GetString().ShouldBe("opaque");
        root.GetProperty("failedStep").GetString().ShouldBe("openShiftVersion");
        root.GetProperty("headline").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Fact]
    public void SerializeDetails_OfNull_IsAnEmptyObject() => AuditTrail.SerializeDetails(null).ShouldBe("{}");
}
