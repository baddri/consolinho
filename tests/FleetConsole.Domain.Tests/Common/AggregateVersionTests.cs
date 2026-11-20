using System.Reflection;
using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Tests.Common;

public sealed class AggregateVersionTests
{
    private sealed class Thing(Guid id) : AggregateRoot<Guid>(id);

    [Fact]
    public void Version_StartsAtZero_ForNewAggregates()
    {
        new Thing(Guid.NewGuid()).Version.ShouldBe(0u);
    }

    [Fact]
    public void Version_CannotBeSetOutsidePersistence()
    {
        // Only EF Core (via the private setter) may write the concurrency token.
        var setter = typeof(AggregateRoot<Guid>).GetProperty(nameof(AggregateRoot<Guid>.Version))!.SetMethod;

        setter.ShouldNotBeNull();
        setter.IsPrivate.ShouldBeTrue();
    }
}
