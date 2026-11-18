namespace FleetConsole.Application.Abstractions.Persistence;

/// <summary>
/// Thrown by <see cref="IUnitOfWork.SaveChangesAsync"/> when a write violates a unique constraint (PostgreSQL SQLSTATE
/// <c>23505</c>): two commands created the same username, cluster name, credential name or (user, cluster) grant at the
/// same time, so the handler's existence check could not see the other one.
/// </summary>
/// <remarks>
/// <c>UnitOfWorkBehavior</c> turns it into a 409 <c>Persistence.DuplicateKey</c> result. The message never contains the
/// duplicated value; <see cref="ConstraintName"/> (e.g. <c>ix_users_username</c>) says which rule was hit, for logs.
/// </remarks>
public sealed class DuplicateKeyException : Exception
{
    private const string DefaultMessage = "A unique constraint was violated.";

    /// <summary>Creates the exception with the default message.</summary>
    public DuplicateKeyException()
        : base(DefaultMessage)
    {
    }

    /// <summary>Creates the exception with a custom message.</summary>
    /// <param name="message">A message without the duplicated value.</param>
    public DuplicateKeyException(string message)
        : base(message)
    {
    }

    /// <summary>Wraps the persistence provider's exception.</summary>
    /// <param name="message">A message without the duplicated value.</param>
    /// <param name="innerException">The provider exception.</param>
    public DuplicateKeyException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    private DuplicateKeyException(string message, string? constraintName, Exception innerException)
        : base(message, innerException)
    {
        ConstraintName = constraintName;
    }

    /// <summary>The violated unique constraint or index name, when known.</summary>
    public string? ConstraintName { get; }

    /// <summary>Wraps the provider's exception and records which unique constraint was violated.</summary>
    /// <param name="constraintName">The violated constraint or unique index, if the provider reported it.</param>
    /// <param name="innerException">The provider exception.</param>
    /// <returns>The exception to throw.</returns>
    public static DuplicateKeyException ForConstraint(string? constraintName, Exception innerException) =>
        new(
            constraintName is null ? DefaultMessage : $"Unique constraint '{constraintName}' was violated.",
            constraintName,
            innerException);
}
