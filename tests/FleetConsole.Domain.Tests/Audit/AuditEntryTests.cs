using System.Reflection;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;

namespace FleetConsole.Domain.Tests.Audit;

public sealed class AuditEntryTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 18, 9, 30, 0, TimeSpan.Zero);

    [Fact]
    public void Record_KeepsEveryArgument()
    {
        var actor = AuditActor.ForUser(UserId.New(), "alice");

        var entry = AuditEntry.Record(
            actor, "grant.created", AuditTargetType.Grant, "3f1c", "bob → prod-eu-1", "prod-eu-1",
            "alice granted bob read-only access to prod-eu-1.", "0af7651916cd43dd8448eb211c80319c",
            """{"username":"bob"}""", Now);

        entry.Id.Value.ShouldNotBe(Guid.Empty);
        entry.Actor.ShouldBe(actor);
        entry.Action.ShouldBe("grant.created");
        entry.Category.ShouldBe(AuditCategory.Grants);
        entry.TargetType.ShouldBe(AuditTargetType.Grant);
        entry.TargetId.ShouldBe("3f1c");
        entry.TargetName.ShouldBe("bob → prod-eu-1");
        entry.ClusterName.ShouldBe("prod-eu-1");
        entry.Summary.ShouldBe("alice granted bob read-only access to prod-eu-1.");
        entry.CorrelationId.ShouldBe("0af7651916cd43dd8448eb211c80319c");
        entry.DetailsJson.ShouldBe("""{"username":"bob"}""");
        entry.OccurredAt.ShouldBe(Now);
        entry.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void Record_AllowsMissingOptionalValues()
    {
        var entry = Record("auth.logout");

        entry.TargetId.ShouldBeNull();
        entry.ClusterName.ShouldBeNull();
        entry.CorrelationId.ShouldBeNull();
    }

    [Theory]
    [InlineData("auth.login", AuditCategory.Auth)]
    [InlineData("auth.login_denied", AuditCategory.Auth)]
    [InlineData("user.read_only_changed", AuditCategory.Users)]
    [InlineData("cluster.registered", AuditCategory.Clusters)]
    [InlineData("credential.token_tested", AuditCategory.Credentials)]
    [InlineData("grant.revoked", AuditCategory.Grants)]
    public void Record_DerivesCategoryFromActionPrefix(string action, AuditCategory category)
    {
        Record(action).Category.ShouldBe(category);
    }

    [Theory]
    [InlineData("")]
    [InlineData("login")]
    [InlineData("auth.")]
    [InlineData(".login")]
    [InlineData("Auth.login")]
    [InlineData("auth.Login")]
    [InlineData("auth.log-in")]
    [InlineData("auth.login.extra")]
    [InlineData("auth.login2")]
    [InlineData("auth.login\n")]
    [InlineData(" auth.login")]
    [InlineData("äuth.login")]
    public void Record_RejectsMalformedAction(string action)
    {
        Should.Throw<ArgumentException>(() => Record(action)).ParamName.ShouldBe("action");
    }

    [Theory]
    [InlineData("users.created")]
    [InlineData("proxy.mutated")]
    [InlineData("session.login")]
    public void Record_RejectsUnknownActionPrefix(string action)
    {
        Should.Throw<ArgumentException>(() => Record(action)).ParamName.ShouldBe("action");
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("[]")]
    [InlineData("null")]
    [InlineData("\"text\"")]
    [InlineData("42")]
    [InlineData("{")]
    public void Record_RejectsDetailsThatAreNotAJsonObject(string details)
    {
        Should.Throw<ArgumentException>(() => Record("auth.logout", details)).ParamName.ShouldBe("detailsJson");
    }

    [Fact]
    public void Record_AcceptsJsonObjectWithSurroundingWhitespace()
    {
        Record("auth.logout", " { \"a\": 1 }\n").DetailsJson.ShouldBe(" { \"a\": 1 }\n");
    }

    [Fact]
    public void Record_GuardsRequiredValues()
    {
        Should.Throw<ArgumentNullException>(() => AuditEntry.Record(
            null!, "auth.logout", AuditTargetType.Session, null, "alice", null, "s", null, "{}", Now));
        Should.Throw<ArgumentException>(() => AuditEntry.Record(
            AuditActor.Configuration, "auth.logout", AuditTargetType.Session, null, " ", null, "s", null, "{}", Now));
        Should.Throw<ArgumentException>(() => AuditEntry.Record(
            AuditActor.Configuration, "auth.logout", AuditTargetType.Session, null, "alice", null, "", null, "{}", Now));
        Should.Throw<ArgumentException>(() => AuditEntry.Record(
            AuditActor.Configuration, "auth.logout", AuditTargetType.Session, null, "alice", null, "s", null, "{}", default));
        Should.Throw<ArgumentOutOfRangeException>(() => AuditEntry.Record(
            AuditActor.Configuration, "auth.logout", (AuditTargetType)42, null, "alice", null, "s", null, "{}", Now));
    }

    [Fact]
    public void AuditEntry_HasNoMutators()
    {
        // AUD-3: append-only. Nothing public may change an entry after Record: no public setters/init accessors and no
        // public instance methods beyond those inherited from AggregateRoot/object.
        var type = typeof(AuditEntry);
        var publicSetters = type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.SetMethod is { IsPublic: true })
            .Select(p => p.Name);
        var declaredMethods = type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(m => !m.IsSpecialName)
            .Select(m => m.Name);
        var publicConstructors = type.GetConstructors(BindingFlags.Public | BindingFlags.Instance);

        publicSetters.ShouldBeEmpty();
        declaredMethods.ShouldBeEmpty();
        publicConstructors.ShouldBeEmpty();
        type.IsSealed.ShouldBeTrue();
    }

    private static AuditEntry Record(string action, string details = "{}") =>
        AuditEntry.Record(
            AuditActor.Configuration, action, AuditTargetType.Session, targetId: null, "alice", clusterName: null,
            "Something happened.", correlationId: null, details, Now);
}
