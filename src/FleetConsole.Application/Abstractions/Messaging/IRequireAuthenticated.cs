namespace FleetConsole.Application.Abstractions.Messaging;

/// <summary>
/// Declares that a request may only be executed by an authenticated user. Enforced centrally by the
/// <c>AuthorizationBehavior</c> (CP1), which returns <see cref="Domain.Common.ErrorType.Unauthorized"/> otherwise, so
/// handlers never check authentication themselves. Endpoint authorization policies remain the first line of defence;
/// this marker makes the use case safe regardless of how it is invoked.
/// </summary>
public interface IRequireAuthenticated;
