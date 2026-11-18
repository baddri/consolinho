using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Users;

namespace FleetConsole.Domain.Tests.Audit;

public sealed class AuditActorTests
{
    [Fact]
    public void Configuration_IsTheSystemConfigActor()
    {
        AuditActor.Configuration.ShouldBe(new AuditActor(null, "system (config)", IsSystem: true));
        AuditActor.Configuration.ShouldBeSameAs(AuditActor.Configuration);
    }

    [Fact]
    public void ForUser_CarriesIdAndName()
    {
        var id = UserId.New();

        AuditActor.ForUser(id, "alice").ShouldBe(new AuditActor(id, "alice", IsSystem: false));
    }

    [Fact]
    public void Anonymous_HasNoUserId()
    {
        AuditActor.Anonymous("mallory").ShouldBe(new AuditActor(null, "mallory", IsSystem: false));
    }

    [Fact]
    public void Guards_RejectBlankNameAndDefaultId()
    {
        Should.Throw<ArgumentException>(() => AuditActor.ForUser(default, "alice"));
        Should.Throw<ArgumentException>(() => AuditActor.ForUser(UserId.New(), " "));
        Should.Throw<ArgumentException>(() => AuditActor.Anonymous(""));
    }
}
