using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Tests.Common;

public sealed class EntityTests
{
    private readonly record struct ThingId(Guid Value);

    private sealed class Thing(ThingId id, string name) : Entity<ThingId>(id)
    {
        public string Name { get; } = name;
    }

    private sealed class OtherThing(ThingId id) : Entity<ThingId>(id);

    [Fact]
    public void EntitiesWithSameTypeAndId_AreEqual_RegardlessOfState()
    {
        var id = new ThingId(Guid.NewGuid());
        var a = new Thing(id, "a");
        var b = new Thing(id, "b");

        a.Equals(b).ShouldBeTrue();
        (a == b).ShouldBeTrue();
        a.GetHashCode().ShouldBe(b.GetHashCode());
    }

    [Fact]
    public void EntitiesWithDifferentIds_AreNotEqual()
    {
        var a = new Thing(new ThingId(Guid.NewGuid()), "a");
        var b = new Thing(new ThingId(Guid.NewGuid()), "a");

        (a != b).ShouldBeTrue();
    }

    [Fact]
    public void EntitiesOfDifferentTypes_WithSameId_AreNotEqual()
    {
        var id = new ThingId(Guid.NewGuid());

        new Thing(id, "a").Equals(new OtherThing(id)).ShouldBeFalse();
    }

    [Fact]
    public void Equality_HandlesNulls()
    {
        Thing? none = null;
        var thing = new Thing(new ThingId(Guid.NewGuid()), "a");

        (none == null).ShouldBeTrue();
        (thing == null).ShouldBeFalse();
        (null == thing).ShouldBeFalse();
        thing.Equals(null).ShouldBeFalse();
    }
}
