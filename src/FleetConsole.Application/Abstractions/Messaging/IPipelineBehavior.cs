using System.Diagnostics.CodeAnalysis;

namespace FleetConsole.Application.Abstractions.Messaging;

/// <summary>
/// A cross-cutting step wrapped around every handler (logging, authorization, validation, read-only guard, caching,
/// unit of work). This is where such concerns live, so adding one never requires touching a use case.
/// </summary>
/// <remarks>
/// <para>Behaviors are registered as open generics (<c>services.AddScoped(typeof(IPipelineBehavior&lt;,&gt;), typeof(MyBehavior&lt;,&gt;))</c>)
/// and run in <b>registration order</b>: the first registered is the outermost. The documented order is maintained in
/// <c>DependencyInjection.AddApplication()</c>.</para>
/// <para>To target a subset of requests, put generic constraints on the behavior class (e.g.
/// <c>where TRequest : IBaseCommand</c>): the container skips behaviors whose constraints the request does not satisfy.
/// A behavior short-circuits by returning without calling <c>next</c> (e.g. a failed <see cref="Domain.Common.Result"/>).</para>
/// </remarks>
/// <typeparam name="TRequest">The request type.</typeparam>
/// <typeparam name="TResponse">The response type declared by the request.</typeparam>
public interface IPipelineBehavior<in TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    /// <summary>Runs this step and, unless short-circuiting, the rest of the pipeline via <paramref name="next"/>.</summary>
    /// <param name="request">The request being dispatched.</param>
    /// <param name="next">Continues with the next behavior or the handler.</param>
    /// <param name="cancellationToken">Cancelled when the caller is aborted.</param>
    /// <returns>The response, either from <paramref name="next"/> or produced by this behavior.</returns>
    [SuppressMessage("Naming", "CA1716:Identifiers should not match keywords",
        Justification = "'next' is only a keyword in VB; it is the conventional pipeline parameter name (BACKEND.md) and the code base is C# only.")]
    Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken);
}
