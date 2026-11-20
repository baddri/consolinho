using System.Security.Claims;
using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Users;

namespace FleetConsole.Api.Auth;

/// <summary>
/// <see cref="ICurrentUser"/> for HTTP requests: the identity of the session cookie on <c>HttpContext.User</c>, parsed
/// by <see cref="SessionPrincipalFactory"/>. Registered scoped in <c>Program</c>.
/// </summary>
/// <remarks>
/// A principal whose session claims are missing or malformed counts as unauthenticated (all members empty), so the
/// pipeline answers 401 rather than acting on half an identity. The parsed result is cached per principal instance:
/// sign-in or revalidation replaces <c>HttpContext.User</c>, which invalidates the cache.
/// </remarks>
/// <param name="httpContextAccessor">Access to the current request; outside a request the user is anonymous.</param>
internal sealed class HttpCurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    private ClaimsPrincipal? _parsedPrincipal;
    private SessionUser? _sessionUser;

    /// <inheritdoc />
    public bool IsAuthenticated => Session is not null;

    /// <inheritdoc />
    public UserId? UserId => Session?.UserId;

    /// <inheritdoc />
    public string? Username => Session?.Username;

    /// <inheritdoc />
    public bool IsReadOnly => Session?.IsReadOnly ?? false;

    /// <inheritdoc />
    public bool IsInRole(UserRole role) => Session is { } session && session.Role == role;

    private SessionUser? Session
    {
        get
        {
            var principal = httpContextAccessor.HttpContext?.User;
            if (!ReferenceEquals(principal, _parsedPrincipal))
            {
                _parsedPrincipal = principal;
                _sessionUser = SessionPrincipalFactory.TryRead(principal, out var user) ? user : null;
            }

            return _sessionUser;
        }
    }
}
