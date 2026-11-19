using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Behaviors;

/// <summary>
/// Innermost pipeline step for commands: after the handler returns a <em>successful</em> result, commits the unit of
/// work (which first dispatches the domain events to their pre-commit handlers, e.g. audit). Failed results and
/// exceptions leave nothing persisted, so handlers can mutate aggregates freely and simply return an error to abort.
/// </summary>
/// <remarks>
/// <para>The <see cref="IBaseCommand"/> constraint makes the DI container skip this behavior for queries entirely — it
/// is never constructed for them, so queries work even where no <see cref="IUnitOfWork"/> is registered.</para>
/// <para><b>Races at commit time</b> are expected failures, not bugs: a row changed after the handler loaded it, or a
/// concurrent delete/insert broke a foreign key (<see cref="ConcurrencyConflictException"/>), or a concurrent command
/// inserted the same natural key
/// (<see cref="DuplicateKeyException"/>). Both become 409 results (<see cref="PersistenceErrors"/>) instead of 500s.
/// Handlers still check the client's <c>version</c> and uniqueness themselves first, with resource-specific messages
/// (ADR-0013 §4); this mapping only covers what those checks can't see.</para>
/// </remarks>
/// <typeparam name="TRequest">The command type.</typeparam>
/// <typeparam name="TResponse"><see cref="Result"/> or <see cref="Result{TValue}"/>.</typeparam>
/// <param name="unitOfWork">The scoped unit of work shared with the handler's repositories.</param>
internal sealed class UnitOfWorkBehavior<TRequest, TResponse>(IUnitOfWork unitOfWork)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>, IBaseCommand
    where TResponse : Result
{
    /// <inheritdoc />
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(next);

        var response = await next(cancellationToken).ConfigureAwait(false);

        if (response.IsFailure)
        {
            return response;
        }

        try
        {
            await unitOfWork.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (ConcurrencyConflictException)
        {
            return FailureResult<TResponse>.Create(PersistenceErrors.ConcurrencyConflict);
        }
        catch (DuplicateKeyException)
        {
            return FailureResult<TResponse>.Create(PersistenceErrors.DuplicateKey);
        }

        return response;
    }
}
