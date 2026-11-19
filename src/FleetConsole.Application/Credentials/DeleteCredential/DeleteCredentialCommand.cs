using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Credentials.DeleteCredential;

/// <summary>
/// Deletes a credential that no grant uses (CRED-6). <c>DELETE /api/admin/clusters/{name}/credentials/{credentialId}</c>;
/// audited as <c>credential.deleted</c>. While grants use it → <c>Credentials.InUse</c> (409) with the grant count, so
/// the admin re-assigns or revokes them first. Deletes take no version (ADR-0013 §4).
/// </summary>
/// <param name="ClusterName">The cluster from the route; unknown → <c>Clusters.NotFound</c>.</param>
/// <param name="CredentialId">The credential; unknown or of another cluster → <c>Credentials.NotFound</c>.</param>
public sealed record DeleteCredentialCommand(string ClusterName, Guid CredentialId) : ICommand, IAdminRequest, IMutatingCommand;
