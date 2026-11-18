using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Behaviors;

/// <summary>
/// Enforces <see cref="IRequireAuthenticated"/> and <see cref="IRequireRole"/> (including <see cref="IAdminRequest"/>)
/// before validation and the handler run: no session → <see cref="AuthErrors.Unauthenticated"/> (401); signed in but
/// without the required role → <see cref="AuthErrors.Forbidden"/> (403). The handler is not called in either case.
/// </summary>
/// <remarks>
/// <para>Runs before <c>ValidationBehavior</c> so anonymous or unauthorized callers learn nothing about which inputs
/// would be valid.</para>
/// <para>The <see cref="IRequireAuthenticated"/> constraint makes the DI container skip this behavior for requests
/// that don't declare an authorization requirement (same technique as <c>UnitOfWorkBehavior</c>). There is deliberately
/// no constraint on <typeparamref name="TResponse"/>: a protected request whose response can't carry an error must
/// fail loudly (<see cref="FailureResult{TResponse}"/> throws) instead of the container silently skipping the check.</para>
/// </remarks>
/// <typeparam name="TRequest">A request that requires authentication.</typeparam>
/// <typeparam name="TResponse"><c>Result</c> or <c>Result&lt;T&gt;</c>.</typeparam>
/// <param name="currentUser">The caller, from the session.</param>
internal sealed class AuthorizationBehavior<TRequest, TResponse>(ICurrentUser currentUser)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>, IRequireAuthenticated
{
    /// <inheritdoc />
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(next);

        if (!currentUser.IsAuthenticated)
        {
            return FailureResult<TResponse>.Create(AuthErrors.Unauthenticated);
        }

        if (request is IRequireRole roleRequirement && !currentUser.IsInRole(roleRequirement.RequiredRole))
        {
            return FailureResult<TResponse>.Create(AuthErrors.Forbidden);
        }

        return await next(cancellationToken).ConfigureAwait(false);
    }
}
