namespace FleetConsole.Application.Abstractions.Messaging;

/// <summary>
/// A message sent through <see cref="IDispatcher"/> and handled by exactly one
/// <see cref="IRequestHandler{TRequest, TResponse}"/>. Do not implement this directly in use cases: implement
/// <see cref="ICommand"/>, <see cref="ICommand{TResponse}"/> or <see cref="IQuery{TResponse}"/> so the request is
/// clearly a state change or a read, and so command-only behaviors (unit of work) apply correctly.
/// </summary>
/// <typeparam name="TResponse">What the handler returns; for use cases always <see cref="Domain.Common.Result"/> or
/// <see cref="Domain.Common.Result{TValue}"/>.</typeparam>
public interface IRequest<TResponse>;
