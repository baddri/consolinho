using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Abstractions.Persistence;

/// <summary>
/// The errors <c>UnitOfWorkBehavior</c> returns when the commit itself fails for an expected reason (a race the
/// handler's own checks could not see). Both are 409s: the client should reload and retry.
/// </summary>
public static class PersistenceErrors
{
    /// <summary>
    /// The row changed between load and save (<see cref="ConcurrencyConflictException"/>). Same code as the
    /// resource-specific version checks in handlers (ADR-0013 §4), with a generic noun.
    /// </summary>
    public static Error ConcurrencyConflict { get; } =
        Error.Conflict("Concurrency.Conflict", "This item was changed by someone else. Reload and try again.");

    /// <summary>A unique constraint was violated by a concurrent create (<see cref="DuplicateKeyException"/>).</summary>
    public static Error DuplicateKey { get; } =
        Error.Conflict("Persistence.DuplicateKey", "This item already exists. Reload and try again.");
}
