using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Access;

/// <summary>
/// The expected failures of the grant area, with the stable codes and user-facing messages of the API contract (§2, §9).
/// </summary>
public static class GrantErrors
{
    /// <summary>No grant with the given id exists (unknown <c>{grantId}</c> in a route). HTTP 404.</summary>
    /// <returns>A <c>Grants.NotFound</c> error.</returns>
    public static Error NotFound() =>
        Error.NotFound("Grants.NotFound", "Grant was not found.");

    /// <summary>
    /// The user already has a grant on the cluster (GRANT-1: at most one per user and cluster). HTTP 409 for a single
    /// create; bulk grant reports the message as a field error instead (§9.4).
    /// </summary>
    /// <param name="username">The user's username.</param>
    /// <param name="clusterName">The cluster's name.</param>
    /// <returns>A <c>Grants.AlreadyExists</c> error.</returns>
    public static Error AlreadyExists(string username, string clusterName) =>
        Error.Conflict(
            "Grants.AlreadyExists",
            $"{username} already has access to {clusterName} — change the existing grant instead.");

    /// <summary>
    /// The chosen credential belongs to another cluster than the grant (GRANT-1). A body reference problem, so HTTP 400;
    /// validators surface it as a field error on <c>credentialId</c>.
    /// </summary>
    /// <returns>A <c>Grants.CredentialNotInCluster</c> error.</returns>
    public static Error CredentialNotInCluster() =>
        Error.Validation("Grants.CredentialNotInCluster", "This credential belongs to another cluster.");
}
