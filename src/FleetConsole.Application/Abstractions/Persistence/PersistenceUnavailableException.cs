namespace FleetConsole.Application.Abstractions.Persistence;

/// <summary>
/// Thrown by the persistence adapters (<see cref="IReadModel"/>, <see cref="IUnitOfWork.SaveChangesAsync"/>) when the
/// database can't be reached right now: a refused or dropped connection, a timeout, or the retrying execution strategy
/// giving up (ADR-0040 §8, CACHE-5).
/// </summary>
/// <remarks>
/// <para>This is an outage, not a bug: the Api's <c>GlobalExceptionHandler</c> answers it with 503 ProblemDetails, code
/// <see cref="PersistenceErrors.UnavailableCode"/> and <c>Retry-After</c>, instead of a 500. It searches the
/// inner-exception chain, so a cache that wraps its loader's exception still yields the 503; with cache fail-safe off a
/// stale entry is never served instead.</para>
/// <para>Errors the database reports for a reachable server (constraint violations, syntax, permissions) are not
/// translated: they stay their existing mappings or 500s. The message carries no host, SQL or values; the provider
/// exception is kept as <see cref="Exception.InnerException"/> for the logs.</para>
/// </remarks>
public sealed class PersistenceUnavailableException : Exception
{
    private const string DefaultMessage = "The database is currently unavailable.";

    /// <summary>Creates the exception with the default message.</summary>
    public PersistenceUnavailableException()
        : base(DefaultMessage)
    {
    }

    /// <summary>Creates the exception with a custom message.</summary>
    /// <param name="message">A message without host names, SQL or values.</param>
    public PersistenceUnavailableException(string message)
        : base(message)
    {
    }

    /// <summary>Wraps the provider's connectivity exception.</summary>
    /// <param name="message">A message without host names, SQL or values.</param>
    /// <param name="innerException">The provider exception (e.g. a transient <c>NpgsqlException</c>).</param>
    public PersistenceUnavailableException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
