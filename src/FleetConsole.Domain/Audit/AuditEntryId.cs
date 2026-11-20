namespace FleetConsole.Domain.Audit;

/// <summary>Strongly typed identity of an <see cref="AuditEntry"/>.</summary>
/// <remarks>
/// Ordered, because the audit-log query pages by <c>(OccurredAt, Id)</c> and needs the id as a tiebreaker in its
/// keyset condition (<c>e.Id &lt; cursorId</c>). The order is the GUID's, which matches PostgreSQL's <c>uuid</c> order
/// (both compare the canonical big-endian form).
/// </remarks>
/// <param name="Value">The underlying GUID (version 7, so ids roughly follow insertion order).</param>
public readonly record struct AuditEntryId(Guid Value) : IComparable<AuditEntryId>
{
    /// <summary>Creates a new, time-ordered (version 7) identity for an entry being recorded.</summary>
    /// <returns>A fresh <see cref="AuditEntryId"/>.</returns>
    public static AuditEntryId New() => new(Guid.CreateVersion7());

    /// <summary>Whether <paramref name="left"/> sorts before <paramref name="right"/>.</summary>
    /// <param name="left">The left id.</param>
    /// <param name="right">The right id.</param>
    /// <returns><see langword="true"/> when left is smaller.</returns>
    public static bool operator <(AuditEntryId left, AuditEntryId right) => left.CompareTo(right) < 0;

    /// <summary>Whether <paramref name="left"/> sorts after <paramref name="right"/>.</summary>
    /// <param name="left">The left id.</param>
    /// <param name="right">The right id.</param>
    /// <returns><see langword="true"/> when left is greater.</returns>
    public static bool operator >(AuditEntryId left, AuditEntryId right) => left.CompareTo(right) > 0;

    /// <summary>Whether <paramref name="left"/> sorts before or equal to <paramref name="right"/>.</summary>
    /// <param name="left">The left id.</param>
    /// <param name="right">The right id.</param>
    /// <returns><see langword="true"/> when left is smaller or equal.</returns>
    public static bool operator <=(AuditEntryId left, AuditEntryId right) => left.CompareTo(right) <= 0;

    /// <summary>Whether <paramref name="left"/> sorts after or equal to <paramref name="right"/>.</summary>
    /// <param name="left">The left id.</param>
    /// <param name="right">The right id.</param>
    /// <returns><see langword="true"/> when left is greater or equal.</returns>
    public static bool operator >=(AuditEntryId left, AuditEntryId right) => left.CompareTo(right) >= 0;

    /// <inheritdoc />
    public int CompareTo(AuditEntryId other) => Value.CompareTo(other.Value);
}
