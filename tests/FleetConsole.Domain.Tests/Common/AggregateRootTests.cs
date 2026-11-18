using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Tests.Common;

public sealed class AggregateRootTests
{
    private sealed record Renamed(Guid ThingId, string NewName) : IDomainEvent;

    private sealed class Thing(Guid id) : AggregateRoot<Guid>(id)
    {
        public void Rename(string name) => RaiseDomainEvent(new Renamed(Id, name));
    }

    [Fact]
    public void RaisedEvents_AreCollectedInOrder()
    {
        var thing = new Thing(Guid.NewGuid());

        thing.Rename("a");
        thing.Rename("b");

        thing.DomainEvents.ShouldBe([new Renamed(thing.Id, "a"), new Renamed(thing.Id, "b")]);
    }

    [Fact]
    public void ClearDomainEvents_RemovesPendingEvents()
    {
        var thing = new Thing(Guid.NewGuid());
        thing.Rename("a");

        ((IHasDomainEvents)thing).ClearDomainEvents();

        thing.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void DomainEvents_CannotBeMutatedFromOutside()
    {
        var thing = new Thing(Guid.NewGuid());

        var events = (ICollection<IDomainEvent>)thing.DomainEvents;

        events.IsReadOnly.ShouldBeTrue();
        Should.Throw<NotSupportedException>(() => events.Add(new Renamed(thing.Id, "x")));
    }
}
