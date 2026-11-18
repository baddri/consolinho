using FleetConsole.Domain.Common;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;

namespace FleetConsole.Infrastructure.Persistence.Conventions;

/// <summary>
/// EF Core model convention: every entity type implementing <see cref="IHasDomainEvents"/> (i.e. every aggregate root)
/// explicitly ignores its <see cref="IHasDomainEvents.DomainEvents"/> property. Pending events are in-memory state for
/// the unit of work, never data.
/// </summary>
/// <remarks>
/// <para>EF Core 10 happens to skip the property on its own today (its element type <see cref="IDomainEvent"/> is an
/// interface, so no navigation is discovered; verified by <c>PersistenceModelTests</c>). The explicit ignore states the
/// intent and keeps the events unmapped regardless of discovery rules, e.g. if a provider or a future EF version starts
/// treating the collection as a primitive/JSON collection.</para>
/// <para>A convention (rather than an <c>Ignore</c> call per entity configuration) means new aggregates can't forget it.
/// It runs when the entity type is added, before property and navigation discovery look at the member.</para>
/// </remarks>
internal sealed class IgnoreDomainEventsConvention : IEntityTypeAddedConvention
{
    /// <inheritdoc />
    public void ProcessEntityTypeAdded(IConventionEntityTypeBuilder entityTypeBuilder, IConventionContext<IConventionEntityTypeBuilder> context)
    {
        if (typeof(IHasDomainEvents).IsAssignableFrom(entityTypeBuilder.Metadata.ClrType))
        {
            entityTypeBuilder.Ignore(nameof(IHasDomainEvents.DomainEvents));
        }
    }
}
