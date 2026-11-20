namespace FleetConsole.Application.Abstractions.Messaging;

/// <summary>
/// Declares that a request may only be executed by an authenticated user. Enforced centrally by the
/// <c>AuthorizationBehavior</c>, which returns <c>Auth.Unauthenticated</c>
/// (<see cref="Domain.Common.ErrorType.Unauthorized"/>) otherwise, so handlers never check authentication themselves.
/// Endpoint authorization (the <c>/api</c> group requires a session) remains the first line of defence; this marker
/// makes the use case safe regardless of how it is invoked.
/// </summary>
/// <remarks>
/// Requests implementing it must return <c>Result</c>/<c>Result&lt;T&gt;</c> so the behavior can report the failure.
/// </remarks>
public interface IRequireAuthenticated;
