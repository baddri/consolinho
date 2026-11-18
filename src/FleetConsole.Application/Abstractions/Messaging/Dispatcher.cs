using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Application.Abstractions.Messaging;

/// <summary>
/// The in-house <see cref="IDispatcher"/> (ADR-0002). Resolves the handler and the pipeline behaviors for a request
/// from the current DI scope and chains them so the first registered behavior runs first.
/// </summary>
/// <remarks>
/// <see cref="Send{TResponse}"/> only knows the request as <see cref="IRequest{TResponse}"/>, but handlers and behaviors
/// are registered for the concrete request type. Bridging the two needs reflection once per request type: a
/// <see cref="RequestHandlerWrapper{TRequest, TResponse}"/> is created and cached, after which dispatch is plain
/// generic code. Registered as scoped so handlers resolve from the caller's scope (e.g. the HTTP request).
/// </remarks>
/// <param name="serviceProvider">The scoped provider used to resolve handlers and behaviors.</param>
internal sealed class Dispatcher(IServiceProvider serviceProvider) : IDispatcher
{
    /// <inheritdoc />
    public Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var wrapper = WrapperCache<TResponse>.Wrappers.GetOrAdd(request.GetType(), static requestType =>
            (RequestHandlerWrapper<TResponse>)Activator.CreateInstance(
                typeof(RequestHandlerWrapper<,>).MakeGenericType(requestType, typeof(TResponse)))!);

        return wrapper.Handle(request, serviceProvider, cancellationToken);
    }

    /// <summary>
    /// Wrapper cache per response type. Keying by request type within a response type means a cached wrapper always
    /// has the right static type, so no cast can fail. Wrappers are stateless and shared across scopes.
    /// </summary>
    private static class WrapperCache<TResponse>
    {
        public static readonly ConcurrentDictionary<Type, RequestHandlerWrapper<TResponse>> Wrappers = new();
    }
}

/// <summary>Response-typed entry point of a cached wrapper; lets <see cref="Dispatcher"/> call it without knowing the request type.</summary>
/// <typeparam name="TResponse">The response type.</typeparam>
internal abstract class RequestHandlerWrapper<TResponse>
{
    /// <summary>Resolves the handler and behaviors for the wrapped request type and executes the pipeline.</summary>
    /// <param name="request">The request; its runtime type is the wrapper's request type.</param>
    /// <param name="serviceProvider">The scoped provider.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The pipeline's response.</returns>
    public abstract Task<TResponse> Handle(IRequest<TResponse> request, IServiceProvider serviceProvider, CancellationToken cancellationToken);
}

/// <summary>Statically typed pipeline builder for one request type.</summary>
/// <typeparam name="TRequest">The concrete request type.</typeparam>
/// <typeparam name="TResponse">The response type.</typeparam>
internal sealed class RequestHandlerWrapper<TRequest, TResponse> : RequestHandlerWrapper<TResponse>
    where TRequest : IRequest<TResponse>
{
    /// <inheritdoc />
    public override Task<TResponse> Handle(IRequest<TResponse> request, IServiceProvider serviceProvider, CancellationToken cancellationToken)
    {
        var typedRequest = (TRequest)request;

        var handler = serviceProvider.GetService<IRequestHandler<TRequest, TResponse>>()
            ?? throw new InvalidOperationException(
                $"No handler is registered for request '{typeof(TRequest).FullName}'. Handlers are discovered by " +
                $"AddApplication(); add a non-abstract class implementing IRequestHandler<{typeof(TRequest).Name}, {typeof(TResponse).Name}>.");

        // The container returns behaviors in registration order; behaviors whose generic constraints the request does
        // not satisfy are skipped by the container. Build the chain from the inside out so index 0 ends up outermost.
        var behaviors = serviceProvider.GetServices<IPipelineBehavior<TRequest, TResponse>>().ToArray();

        RequestHandlerDelegate<TResponse> pipeline = ct => handler.Handle(typedRequest, ct);
        for (var i = behaviors.Length - 1; i >= 0; i--)
        {
            var behavior = behaviors[i];
            var next = pipeline;
            pipeline = ct => behavior.Handle(typedRequest, next, ct);
        }

        return pipeline(cancellationToken);
    }
}
