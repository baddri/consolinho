using System.Diagnostics.CodeAnalysis;

namespace FleetConsole.Application.Abstractions.Messaging;

/// <summary>
/// The rest of the pipeline as seen from a behavior: invoking it runs the next behavior, or the handler when the
/// calling behavior is the innermost one.
/// </summary>
/// <remarks>
/// The token is passed explicitly so a behavior can hand a different one downstream (e.g. a linked token enforcing a
/// timeout). Behaviors that do not need that simply forward the token they received.
/// </remarks>
/// <typeparam name="TResponse">The response type of the request being processed.</typeparam>
/// <param name="cancellationToken">Token for the remainder of the pipeline.</param>
/// <returns>The response produced by the rest of the pipeline.</returns>
[SuppressMessage("Naming", "CA1711:Identifiers should not have incorrect suffix",
    Justification = "Name is part of the documented messaging contract (BACKEND.md, ADR-0002) and it is a delegate.")]
public delegate Task<TResponse> RequestHandlerDelegate<TResponse>(CancellationToken cancellationToken);
