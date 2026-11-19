namespace FleetConsole.Application.Abstractions.Persistence;

/// <summary>
/// Thrown by <see cref="IUnitOfWork.SaveChangesAsync"/> when the commit lost a race against a concurrent command: a row
/// changed (or was deleted) between the command loading it and saving it, so the optimistic concurrency token
/// (<c>Version</c>, PostgreSQL <c>xmin</c>) no longer matches; or a foreign key rejected the write (SQLSTATE 23503)
/// because a referenced row was deleted, or a referencing row inserted, concurrently (e.g. a grant created for a
/// credential that was just deleted).
/// </summary>
/// <remarks>
/// <para>Handlers compare the client's <c>version</c> with the loaded aggregate and check references first, returning
/// resource-specific errors themselves (ADR-0013 §4); this exception only covers the race after those checks. In both
/// cases the client should do the same thing: reload and retry.</para>
/// <para><c>UnitOfWorkBehavior</c> turns it into the generic 409 <c>Concurrency.Conflict</c> result, so it never reaches
/// the exception handler. It carries no entity data (at most a constraint name): the message is safe to log.</para>
/// <para>A <c>restrict_violation</c> (23001, deleting a user that has grants) is <em>not</em> translated: users are never
/// deleted, so it is a bug and stays a 500.</para>
/// </remarks>
public sealed class ConcurrencyConflictException : Exception
{
    private const string DefaultMessage = "The data was changed by someone else since it was loaded.";

    /// <summary>Creates the exception with the default message.</summary>
    public ConcurrencyConflictException()
        : base(DefaultMessage)
    {
    }

    /// <summary>Creates the exception with a custom message.</summary>
    /// <param name="message">A message without entity data.</param>
    public ConcurrencyConflictException(string message)
        : base(message)
    {
    }

    /// <summary>Wraps the persistence provider's concurrency exception.</summary>
    /// <param name="message">A message without entity data.</param>
    /// <param name="innerException">The provider exception (e.g. EF Core's <c>DbUpdateConcurrencyException</c>).</param>
    public ConcurrencyConflictException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
