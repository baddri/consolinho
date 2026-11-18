namespace FleetConsole.Domain.Common;

/// <summary>
/// Base class for objects with identity: two entities are equal when they are of the same concrete type and have the
/// same <see cref="Id"/>, regardless of their other state. Use strongly typed ids
/// (<c>readonly record struct UserId(Guid Value)</c>) so ids of different aggregates cannot be mixed up.
/// </summary>
/// <typeparam name="TId">The strongly typed identifier.</typeparam>
public abstract class Entity<TId> : IEquatable<Entity<TId>>
    where TId : notnull
{
    /// <summary>Creates an entity with its identity. Ids are assigned by the domain (factory methods), never by the database.</summary>
    /// <param name="id">The entity's identity.</param>
    protected Entity(TId id)
    {
        ArgumentNullException.ThrowIfNull(id);
        Id = id;
    }

    /// <summary>
    /// Parameterless constructor for ORM materialization only: EF Core sets <see cref="Id"/> right after construction.
    /// Domain code must use <see cref="Entity{TId}(TId)"/>.
    /// </summary>
    protected Entity() => Id = default!;

    /// <summary>The entity's identity. Immutable once assigned.</summary>
    public TId Id { get; private init; }

    /// <summary>Identity equality: same concrete type and same <see cref="Id"/>.</summary>
    /// <param name="other">The entity to compare with.</param>
    /// <returns><see langword="true"/> if both represent the same entity.</returns>
    public bool Equals(Entity<TId>? other) =>
        other is not null
        && (ReferenceEquals(this, other) || (other.GetType() == GetType() && EqualityComparer<TId>.Default.Equals(Id, other.Id)));

    /// <inheritdoc />
    public override bool Equals(object? obj) => obj is Entity<TId> other && Equals(other);

    /// <inheritdoc />
    public override int GetHashCode() => HashCode.Combine(GetType(), Id);

    /// <summary>Identity equality operator; see <see cref="Equals(Entity{TId})"/>.</summary>
    /// <param name="left">Left operand.</param>
    /// <param name="right">Right operand.</param>
    /// <returns><see langword="true"/> if both are null or represent the same entity.</returns>
    public static bool operator ==(Entity<TId>? left, Entity<TId>? right) => left?.Equals(right) ?? right is null;

    /// <summary>Identity inequality operator; see <see cref="Equals(Entity{TId})"/>.</summary>
    /// <param name="left">Left operand.</param>
    /// <param name="right">Right operand.</param>
    /// <returns><see langword="true"/> unless both are null or represent the same entity.</returns>
    public static bool operator !=(Entity<TId>? left, Entity<TId>? right) => !(left == right);
}
