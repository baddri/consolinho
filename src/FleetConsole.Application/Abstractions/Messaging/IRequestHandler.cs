namespace FleetConsole.Application.Abstractions.Messaging;

/// <summary>
/// Executes one use case. Exactly one handler exists per request type; handlers are discovered by assembly scanning in
/// <c>AddApplication()</c> and registered as scoped services, so they can depend on scoped ports (repositories, unit of
/// work). Declare handlers <c>internal sealed</c>.
/// </summary>
/// <remarks>
/// Handlers contain only the use case logic. Validation, authorization, logging and persistence are applied by
/// <see cref="IPipelineBehavior{TRequest, TResponse}"/>s around the handler and must not be repeated inside it.
/// </remarks>
/// <typeparam name="TRequest">The command or query type handled.</typeparam>
/// <typeparam name="TResponse">The response type declared by the request.</typeparam>
public interface IRequestHandler<in TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    /// <summary>Executes the use case.</summary>
    /// <param name="request">The command or query.</param>
    /// <param name="cancellationToken">Cancelled when the caller (e.g. the HTTP request) is aborted.</param>
    /// <returns>The use case outcome; expected failures are returned as a failed <see cref="Domain.Common.Result"/>, not thrown.</returns>
    Task<TResponse> Handle(TRequest request, CancellationToken cancellationToken);
}
