using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;
using FleetConsole.Infrastructure.Persistence;
using FleetConsole.Infrastructure.Persistence.Conventions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

namespace FleetConsole.Api.Tests.Persistence;

/// <summary>
/// Unit tests for the persistence plumbing that later aggregates rely on. No database: building the model and tracking
/// entities only need the Npgsql provider, not a connection.
/// </summary>
public sealed class PersistenceModelTests
{
    [Fact]
    public void IgnoreDomainEventsConvention_KeepsDomainEventsOutOfTheModel()
    {
        using var db = WidgetDbContext.Create(withConvention: true);

        var widget = db.Model.FindEntityType(typeof(Widget)).ShouldNotBeNull();

        widget.FindNavigation(nameof(Widget.DomainEvents)).ShouldBeNull();
        widget.FindProperty(nameof(Widget.DomainEvents)).ShouldBeNull();
        widget.FindProperty(nameof(Widget.Name)).ShouldNotBeNull();
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void IgnoreDomainEventsConvention_IsWhatRecordsTheIgnore(bool withConvention)
    {
        // EF Core already skips the interface-typed collection by itself, so "not mapped" alone would pass without the
        // convention. The design-time model keeps ignored members, which shows the convention actually ran.
        using var db = WidgetDbContext.Create(withConvention);
        var model = (IConventionModel)db.GetService<IDesignTimeModel>().Model;

        var ignored = model.FindEntityType(typeof(Widget))!.FindIgnoredConfigurationSource(nameof(Widget.DomainEvents));

        (ignored is not null).ShouldBe(withConvention);
    }

    [Fact]
    public void PendingDomainEvents_ListsEventsInOrder_AndClearsAggregatesOnlyOnClear()
    {
        using var db = WidgetDbContext.Create(withConvention: true);
        var first = Widget.Create("first");
        var second = Widget.Create("second");
        first.Rename("renamed");
        var quiet = new Widget(Guid.NewGuid(), "quiet");
        db.AddRange(first, second, quiet);

        var pending = PendingDomainEvents.Capture(db.ChangeTracker);

        pending.Events.Cast<WidgetEvent>().Select(e => e.What)
            .ShouldBe(["created first", "renamed renamed", "created second"]);
        first.DomainEvents.Count.ShouldBe(2, "events stay until the write succeeded");

        pending.Clear();

        first.DomainEvents.ShouldBeEmpty();
        second.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void PendingDomainEvents_EnsureNoEventsRaisedSince_PassesWhenNothingNewWasRaised()
    {
        using var db = WidgetDbContext.Create(withConvention: true);
        db.Add(Widget.Create("w"));
        db.Add(new Widget(Guid.NewGuid(), "quiet"));
        var pending = PendingDomainEvents.Capture(db.ChangeTracker);

        Should.NotThrow(() => pending.EnsureNoEventsRaisedSince(db.ChangeTracker));
    }

    [Fact]
    public void PendingDomainEvents_EnsureNoEventsRaisedSince_ThrowsForANewEventOnACapturedAggregate()
    {
        using var db = WidgetDbContext.Create(withConvention: true);
        var widget = Widget.Create("w");
        db.Add(widget);
        var pending = PendingDomainEvents.Capture(db.ChangeTracker);

        widget.Rename("again");

        Should.Throw<InvalidOperationException>(() => pending.EnsureNoEventsRaisedSince(db.ChangeTracker))
            .Message.ShouldContain(nameof(Widget));
    }

    [Fact]
    public void PendingDomainEvents_EnsureNoEventsRaisedSince_ThrowsForANewlyTrackedAggregateWithEvents()
    {
        using var db = WidgetDbContext.Create(withConvention: true);
        db.Add(Widget.Create("w"));
        var pending = PendingDomainEvents.Capture(db.ChangeTracker);

        db.Add(Widget.Create("added by a handler"));

        Should.Throw<InvalidOperationException>(() => pending.EnsureNoEventsRaisedSince(db.ChangeTracker))
            .Message.ShouldContain(nameof(Widget));
    }

    [Fact]
    public void PendingDomainEvents_CapturesOnlyWhatExistedAtCaptureTime()
    {
        using var db = WidgetDbContext.Create(withConvention: true);
        var widget = Widget.Create("w");
        db.Add(widget);

        var pending = PendingDomainEvents.Capture(db.ChangeTracker);
        var late = Widget.Create("late");
        db.Add(late);

        pending.Events.Count.ShouldBe(1);
        late.DomainEvents.Count.ShouldBe(1);
    }

    [Fact]
    public void ConsoleDbContext_SynchronousSaveChanges_IsNotSupportedForApplicationData()
    {
        var options = new DbContextOptionsBuilder<ConsoleDbContext>();
        ConsoleDbContext.ConfigureProvider(options, connectionString: null);
        using var db = new ConsoleDbContext(options.Options, new NullDispatcher());
        db.Add(User.Provision(Username.Create("sync-save").Value, DateTimeOffset.UtcNow));

        // Refused before any database access (there is no connection string here).
        Should.Throw<NotSupportedException>(() => db.SaveChanges());
    }

    [Fact]
    public void ConsoleDbContext_SynchronousSaveChanges_WithNothingPending_IsAllowed()
    {
        // The Data Protection key repository saves synchronously; with only key rows (here: nothing) pending, the guard
        // lets the save through. Writing actual key rows is covered by the Data Protection integration tests.
        var options = new DbContextOptionsBuilder<ConsoleDbContext>();
        ConsoleDbContext.ConfigureProvider(options, connectionString: null);
        using var db = new ConsoleDbContext(options.Options, new NullDispatcher());

        db.SaveChanges().ShouldBe(0);
    }

    [Fact]
    public void ConsoleDbContext_UsesSnakeCaseHistoryTable()
    {
        ConsoleDbContext.MigrationsHistoryTable.ShouldBe("__ef_migrations_history");
    }

    private sealed record WidgetEvent(string What) : IDomainEvent;

    private sealed class Widget : AggregateRoot<Guid>
    {
        public Widget(Guid id, string name)
            : base(id) => Name = name;

        public string Name { get; private set; }

        public static Widget Create(string name)
        {
            var widget = new Widget(Guid.NewGuid(), name);
            widget.RaiseDomainEvent(new WidgetEvent($"created {name}"));
            return widget;
        }

        public void Rename(string name)
        {
            Name = name;
            RaiseDomainEvent(new WidgetEvent($"renamed {name}"));
        }
    }

    // EF Core caches the built model per context *type*, so "with" and "without" the convention must be distinct types.
    private class WidgetDbContext : DbContext
    {
        protected virtual bool WithConvention => true;

        public static WidgetDbContext Create(bool withConvention) =>
            withConvention ? new WidgetDbContext() : new PlainWidgetDbContext();

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) =>
            optionsBuilder.UseNpgsql().UseSnakeCaseNamingConvention();

        protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
        {
            if (WithConvention)
            {
                configurationBuilder.Conventions.Add(_ => new IgnoreDomainEventsConvention());
            }
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder) => modelBuilder.Entity<Widget>();
    }

    private sealed class PlainWidgetDbContext : WidgetDbContext
    {
        protected override bool WithConvention => false;
    }

    private sealed class NullDispatcher : IDomainEventDispatcher
    {
        public Task DispatchAsync(IReadOnlyList<IDomainEvent> domainEvents, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task DispatchPostCommitAsync(IReadOnlyList<IDomainEvent> domainEvents, CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
