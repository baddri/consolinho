using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Behaviors;

/// <summary>
/// Refuses commands marked <see cref="IMutatingCommand"/> for globally read-only users with
/// <see cref="AuthErrors.ReadOnly"/> (403, ADM-2), before the handler runs. Queries and commands that aren't
/// mutating pass through, so a read-only admin (auditor persona) can still browse Administration.
/// </summary>
/// <remarks>
/// <para>Runs after <c>AuthorizationBehavior</c> and <c>ValidationBehavior</c>. <see cref="IMutatingCommand"/> implies
/// <see cref="IRequireAuthenticated"/>, so an anonymous caller always gets 401 first, never a pass; a non-admin gets 403
/// <c>Auth.Forbidden</c> first; a read-only admin sees field errors before the read-only refusal, which
/// matches the documented pipeline order (BACKEND.md).</para>
/// <para>The <see cref="IMutatingCommand"/> constraint makes the container skip it for every other request. Like
/// <see cref="AuthorizationBehavior{TRequest, TResponse}"/> it leaves <typeparamref name="TResponse"/> unconstrained so a
/// misdeclared response type fails loudly rather than bypassing the guard.</para>
/// <para>The read-only flag comes from the session (at most <c>Auth:RevalidationInterval</c> old, ADR-0009).</para>
/// </remarks>
/// <typeparam name="TRequest">A mutating command.</typeparam>
/// <typeparam name="TResponse"><c>Result</c> or <c>Result&lt;T&gt;</c>.</typeparam>
/// <param name="currentUser">The caller, from the session.</param>
internal sealed class ReadOnlyGuardBehavior<TRequest, TResponse>(ICurrentUser currentUser)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>, IMutatingCommand
{
    /// <inheritdoc />
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(next);

        if (currentUser.IsReadOnly)
        {
            return FailureResult<TResponse>.Create(AuthErrors.ReadOnly);
        }

        return await next(cancellationToken).ConfigureAwait(false);
    }
}
