using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Behaviors;

/// <summary>
/// Innermost pipeline step for commands: after the handler returns a <em>successful</em> result, commits the unit of
/// work (which also dispatches domain events). Failed results and exceptions leave nothing persisted, so handlers can
/// mutate aggregates freely and simply return an error to abort.
/// </summary>
/// <remarks>
/// The <see cref="IBaseCommand"/> constraint makes the DI container skip this behavior for queries entirely — it is
/// never constructed for them, so queries work even where no <see cref="IUnitOfWork"/> is registered.
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

        if (response.IsSuccess)
        {
            await unitOfWork.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }

        return response;
    }
}
