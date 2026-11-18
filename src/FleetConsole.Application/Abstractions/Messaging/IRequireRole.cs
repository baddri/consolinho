using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Abstractions.Messaging;

/// <summary>
/// Declares that a request may only be executed by users holding a specific role. Implies
/// <see cref="IRequireAuthenticated"/>. Enforced by the <c>AuthorizationBehavior</c>, which returns
/// <c>Auth.Forbidden</c> (<see cref="Domain.Common.ErrorType.Forbidden"/>) for authenticated users without the role.
/// </summary>
/// <remarks>
/// Admin use cases don't implement this directly: they implement <see cref="IAdminRequest"/>, which supplies the role.
/// </remarks>
public interface IRequireRole : IRequireAuthenticated
{
    /// <summary>The role the current user must hold, checked with <see cref="ICurrentUser.IsInRole"/>.</summary>
    UserRole RequiredRole { get; }
}
