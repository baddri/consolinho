using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Credentials.RotateCredentialToken;

/// <summary>
/// Replaces a credential's token in place (CRED-5): same id, all grants keep working with the new token, the stored last
/// test is cleared (it described the old token). <c>PUT /api/admin/clusters/{name}/credentials/{credentialId}/token</c>;
/// audited as <c>credential.rotated</c> with the old and new fingerprints. Does not run a connection test.
/// </summary>
/// <remarks>
/// Never a no-op: re-submitting the same token is a rotation too (the Domain can't compare plaintexts). Admin command:
/// refused for read-only admins. The endpoint reads the result with <c>GetCredentialQuery</c>.
/// </remarks>
/// <param name="ClusterName">The cluster from the route; unknown → <c>Clusters.NotFound</c>.</param>
/// <param name="CredentialId">The credential; unknown or of another cluster → <c>Credentials.NotFound</c>.</param>
/// <param name="Token">The new token, already trimmed by the Api.</param>
/// <param name="Version">The credential's <c>version</c> the client last saw; stale → <c>Concurrency.Conflict</c>.</param>
public sealed record RotateCredentialTokenCommand(string ClusterName, Guid CredentialId, SensitiveString Token, uint Version)
    : ICommand, IAdminRequest, IMutatingCommand;
