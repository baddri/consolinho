namespace FleetConsole.Application.Abstractions.Messaging;

/// <summary>
/// Marks a command that changes FleetConsole state on behalf of the caller and must therefore be refused for
/// globally read-only users (ADM-2). Enforced by the <c>ReadOnlyGuardBehavior</c> (<c>Auth.ReadOnly</c>, 403).
/// Every admin command implements it together with <see cref="IAdminRequest"/>. Commands read-only users must still be
/// able to run (logout, login bookkeeping) simply do not implement it.
/// </summary>
/// <remarks>
/// Extends <see cref="IRequireAuthenticated"/>: a change made "on behalf of the caller" needs a caller, and an anonymous
/// request would otherwise pass the read-only guard (its <c>IsReadOnly</c> is <see langword="false"/>). The
/// <c>AuthorizationBehavior</c> therefore answers 401 before the guard runs.
/// </remarks>
public interface IMutatingCommand : IBaseCommand, IRequireAuthenticated;
