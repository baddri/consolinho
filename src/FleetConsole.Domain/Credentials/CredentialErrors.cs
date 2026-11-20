using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Credentials;

/// <summary>
/// The expected failures of the credential area, with the stable codes and user-facing messages of the API contract
/// (§2). Messages never contain token material (CRED-2).
/// </summary>
public static class CredentialErrors
{
    /// <summary>
    /// No credential with the given id exists on the addressed cluster (unknown <c>{credentialId}</c> in a route, or one
    /// belonging to another cluster). HTTP 404.
    /// </summary>
    /// <returns>A <c>Credentials.NotFound</c> error.</returns>
    public static Error NotFound() =>
        Error.NotFound("Credentials.NotFound", "Credential was not found.");

    /// <summary>Adding a credential whose name is already used on the cluster (CRED-1). HTTP 409.</summary>
    /// <param name="name">The duplicate credential name.</param>
    /// <param name="clusterName">The cluster's name.</param>
    /// <returns>A <c>Credentials.NameTaken</c> error.</returns>
    public static Error NameTaken(string name, string clusterName) =>
        Error.Conflict("Credentials.NameTaken", $"Credential {name} already exists on cluster {clusterName}.");

    /// <summary>Deleting a credential that grants still use (CRED-6). HTTP 409.</summary>
    /// <param name="name">The credential's name.</param>
    /// <param name="grantCount">How many grants use it (at least 1).</param>
    /// <returns>A <c>Credentials.InUse</c> error.</returns>
    public static Error InUse(string name, int grantCount) =>
        Error.Conflict(
            "Credentials.InUse",
            $"Credential {name} is used by {grantCount} {(grantCount == 1 ? "grant" : "grants")}. Re-assign or revoke them first.");

    /// <summary>
    /// A credential name breaks the DNS-label rules (CRED-1). Produced by <see cref="CredentialName.Create"/>; validators
    /// surface the message as a field error on <c>name</c>. HTTP 400.
    /// </summary>
    /// <param name="message">Which rule was broken.</param>
    /// <returns>A <c>Credentials.InvalidName</c> error.</returns>
    public static Error InvalidName(string message) =>
        Error.Validation("Credentials.InvalidName", message);
}
