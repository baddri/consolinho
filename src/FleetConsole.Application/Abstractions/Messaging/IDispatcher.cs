namespace FleetConsole.Application.Abstractions.Messaging;

/// <summary>
/// Entry point for executing use cases: endpoints (and other callers) send a command or query and get its result,
/// without knowing the handler or the behaviors around it (ADR-0002).
/// </summary>
/// <example><c>var result = await dispatcher.Send(new GetSystemInfoQuery(), ct); return result.ToHttpResult();</c></example>
public interface IDispatcher
{
    /// <summary>Runs <paramref name="request"/> through the pipeline behaviors and its handler.</summary>
    /// <typeparam name="TResponse">The response type declared by the request.</typeparam>
    /// <param name="request">The command or query.</param>
    /// <param name="cancellationToken">Cancelled when the caller is aborted.</param>
    /// <returns>The handler's response, possibly replaced by a behavior that short-circuited (e.g. a validation failure).</returns>
    /// <exception cref="InvalidOperationException">When no handler is registered for the request type (a wiring bug).</exception>
    Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken);
}
