namespace FleetConsole.Application.Abstractions.Persistence;

/// <summary>
/// Thrown by <see cref="IUnitOfWork.SaveChangesAsync"/> when a row changed (or was deleted) between the command loading
/// it and saving it: the optimistic concurrency token (<c>Version</c>, PostgreSQL <c>xmin</c>) no longer matches.
/// </summary>
/// <remarks>
/// Handlers compare the client's <c>version</c> with the loaded aggregate first and return a resource-specific
/// <c>Concurrency.Conflict</c> themselves (ADR-0013 §4); this exception only covers the race after that check.
/// <c>UnitOfWorkBehavior</c> turns it into the generic 409 <c>Concurrency.Conflict</c> result, so it never reaches the
/// exception handler. It carries no entity data: the message is safe to log.
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
