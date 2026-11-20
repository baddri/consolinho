using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Abstractions;

/// <summary>
/// Port describing who is executing the current request. Used by the authorization and read-only behaviors and by
/// handlers that need the caller's identity (audit actor, self-change rules). Keeps the Application layer independent
/// of how users authenticate (OpenShift OAuth + cookie session today — ADR-0007, ADR-0009).
/// </summary>
/// <remarks>
/// Implemented in the Api by <c>HttpCurrentUser</c> from the session claims of <c>HttpContext.User</c>. Role and
/// read-only flag are the values from the session, refreshed by revalidation at most <c>Auth:RevalidationInterval</c>
/// (60 s) ago; rules that must be exact (last-admin protection, ADM-5) read the database instead.
/// </remarks>
public interface ICurrentUser
{
    /// <summary>Whether the request comes from an authenticated user. When false, the other members carry no identity.</summary>
    bool IsAuthenticated { get; }

    /// <summary>The FleetConsole user id, or <see langword="null"/> when unauthenticated.</summary>
    UserId? UserId { get; }

    /// <summary>The login name, or <see langword="null"/> when unauthenticated. For display and audit only, never for authorization.</summary>
    string? Username { get; }

    /// <summary>
    /// Whether the user is globally read-only (ADM-2): admin commands marked <see cref="Messaging.IMutatingCommand"/>
    /// are refused by the <c>ReadOnlyGuardBehavior</c>. <see langword="false"/> when unauthenticated.
    /// </summary>
    bool IsReadOnly { get; }

    /// <summary>
    /// Whether the user's effective role is <paramref name="role"/> (see <see cref="Messaging.IRequireRole"/>). Roles
    /// are not hierarchical: an admin is not "in" <see cref="UserRole.User"/>.
    /// </summary>
    /// <param name="role">The role to check.</param>
    /// <returns><see langword="true"/> if authenticated and the session's role equals <paramref name="role"/>.</returns>
    bool IsInRole(UserRole role);
}
