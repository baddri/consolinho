using FleetConsole.Application.Abstractions;

namespace FleetConsole.Application.Clusters;

/// <summary>Reads the acting admin's username for the <c>CreatedBy</c>/<c>UpdatedBy</c> fields set by cluster commands.</summary>
internal static class ActingAdmin
{
    /// <summary>
    /// The current user's username. Cluster commands are <c>IAdminRequest</c>s, so <c>AuthorizationBehavior</c> has
    /// already refused anonymous callers; a missing name here is a bug, not an expected failure.
    /// </summary>
    /// <param name="currentUser">The caller.</param>
    /// <returns>The username.</returns>
    /// <exception cref="InvalidOperationException">When the request reached the handler without a signed-in user.</exception>
    public static string Username(ICurrentUser currentUser) =>
        currentUser.Username
        ?? throw new InvalidOperationException("A cluster command reached its handler without a signed-in user.");
}
