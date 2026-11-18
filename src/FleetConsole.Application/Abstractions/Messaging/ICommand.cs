using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Abstractions.Messaging;

/// <summary>
/// Non-generic marker shared by <see cref="ICommand"/> and <see cref="ICommand{TResponse}"/>. Pipeline behaviors that
/// apply to state changes only (e.g. <c>UnitOfWorkBehavior</c>) constrain on it, so the DI container never even
/// creates them for queries. Use cases implement one of the two command interfaces, never this one directly.
/// </summary>
public interface IBaseCommand;

/// <summary>
/// A use case that changes state and has no payload to return beyond success/failure (e.g. <c>RevokeGrantCommand</c>).
/// Implement as a <c>public sealed record</c> in <c>Application/&lt;Feature&gt;/&lt;UseCase&gt;/</c>.
/// </summary>
/// <remarks>
/// The <c>UnitOfWorkBehavior</c> persists the unit of work only when the handler returns a successful <see cref="Result"/>.
/// </remarks>
public interface ICommand : IRequest<Result>, IBaseCommand;

/// <summary>
/// A use case that changes state and returns a value on success (typically the id of what it created).
/// </summary>
/// <typeparam name="TResponse">The value returned on success.</typeparam>
public interface ICommand<TResponse> : IRequest<Result<TResponse>>, IBaseCommand;
