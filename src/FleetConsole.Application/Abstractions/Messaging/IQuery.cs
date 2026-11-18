using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Abstractions.Messaging;

/// <summary>
/// A read-only use case: it must not change state, so the unit of work is never saved for it. Query handlers read
/// through the read model and project directly to DTOs instead of loading aggregates.
/// Implement as a <c>public sealed record</c> in <c>Application/&lt;Feature&gt;/&lt;UseCase&gt;/</c>.
/// </summary>
/// <typeparam name="TResponse">The DTO returned on success.</typeparam>
public interface IQuery<TResponse> : IRequest<Result<TResponse>>;
