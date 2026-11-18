namespace FleetConsole.Application.Abstractions;

/// <summary>
/// Port describing who is executing the current request. Used by authorization/read-only behaviors and by handlers
/// that need the caller's identity (audit, self-service). Keeps the Application layer independent of how users
/// authenticate (cookie today, possibly OIDC later — SECURITY.md).
/// </summary>
/// <remarks>Implemented in the Api from the authenticated <c>HttpContext.User</c> (CP1).</remarks>
public interface ICurrentUser
{
    /// <summary>Whether the request comes from an authenticated user. When false, the other members carry no identity.</summary>
    bool IsAuthenticated { get; }

    /// <summary>
    /// The FleetConsole user id, or <see langword="null"/> when unauthenticated. A plain <see cref="Guid"/> until the
    /// <c>UserId</c> value object exists (CP1).
    /// </summary>
    Guid? UserId { get; }

    /// <summary>The login name, or <see langword="null"/> when unauthenticated. For display and audit only, never for authorization.</summary>
    string? Username { get; }

    /// <summary>Whether the user holds <paramref name="role"/> (see <see cref="Messaging.IRequireRole"/>).</summary>
    /// <param name="role">The role name.</param>
    /// <returns><see langword="true"/> if authenticated and in the role.</returns>
    bool IsInRole(string role);
}
