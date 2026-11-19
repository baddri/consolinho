using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Auth.GetSessionState;

/// <summary>
/// Reads what session revalidation needs to keep, refresh or end a session (AUTH-11, ADR-0009): active?, current role
/// and read-only flag, security stamp. Dispatched by the Api's <c>SessionValidator</c> every
/// <c>Auth:RevalidationInterval</c>.
/// </summary>
/// <remarks>
/// Deliberately <b>not</b> <see cref="IRequireAuthenticated"/>: it runs inside cookie validation, before
/// <c>HttpContext.User</c> is set. It is never mapped to an endpoint. Returns <c>Users.NotFound</c> for an unknown id.
/// </remarks>
/// <param name="UserId">The user id from the session.</param>
public sealed record GetSessionStateQuery(UserId UserId) : IQuery<SessionStateDto>;
