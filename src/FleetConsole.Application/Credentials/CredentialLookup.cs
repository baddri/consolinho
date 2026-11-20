using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Credentials;

/// <summary>
/// Write-side lookups shared by the credential command handlers: resolving the <c>{name}</c> and <c>{credentialId}</c>
/// route values to tracked aggregates with the contract's 404s, and the resource-specific concurrency error.
/// </summary>
internal static class CredentialLookup
{
    /// <summary>
    /// The 409 for a stale <c>version</c> on a credential (ADR-0013 §4). Same code as the generic commit-time conflict
    /// <c>UnitOfWorkBehavior</c> returns, with the resource noun in the message (contract §2).
    /// </summary>
    public static Error ConcurrencyConflict { get; } =
        Error.Conflict("Concurrency.Conflict", "This credential was changed by someone else. Reload and try again.");

    /// <summary>
    /// The acting admin's username, recorded as <c>CreatedBy</c>/<c>RotatedBy</c>. Admin commands only run for signed-in
    /// users (<c>AuthorizationBehavior</c>), so a missing name is a wiring bug, not an expected failure.
    /// </summary>
    /// <param name="currentUser">The current user.</param>
    /// <returns>The username.</returns>
    /// <exception cref="InvalidOperationException">When there is no signed-in user.</exception>
    public static string Actor(ICurrentUser currentUser) =>
        currentUser.Username ?? throw new InvalidOperationException("Credential commands require a signed-in user.");

    /// <summary>
    /// Loads the cluster named in the route for modification. A value that isn't a valid cluster name can't exist, so it
    /// is <c>Clusters.NotFound</c> as well (unknown route ids are 404s, ADR-0013 §8).
    /// </summary>
    /// <param name="clusters">The cluster repository.</param>
    /// <param name="clusterName">The cluster name from the route.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The tracked cluster, or <c>Clusters.NotFound</c>.</returns>
    public static async Task<Result<Cluster>> FindClusterAsync(
        IClusterRepository clusters, string clusterName, CancellationToken cancellationToken)
    {
        var name = ClusterName.Create(clusterName);
        if (name.IsFailure)
        {
            return ClusterErrors.NotFound(clusterName);
        }

        var cluster = await clusters.GetByNameAsync(name.Value, cancellationToken).ConfigureAwait(false);
        return cluster is null ? ClusterErrors.NotFound(clusterName) : cluster;
    }

    /// <summary>
    /// Loads the cluster and one of its credentials for modification. A credential of another cluster is reported like an
    /// unknown one (<c>Credentials.NotFound</c>), so a URL can't reach across clusters.
    /// </summary>
    /// <param name="clusters">The cluster repository.</param>
    /// <param name="credentials">The credential repository.</param>
    /// <param name="clusterName">The cluster name from the route.</param>
    /// <param name="credentialId">The credential id from the route.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Both tracked aggregates, or <c>Clusters.NotFound</c> / <c>Credentials.NotFound</c>.</returns>
    public static async Task<Result<(Cluster Cluster, Credential Credential)>> FindCredentialAsync(
        IClusterRepository clusters,
        ICredentialRepository credentials,
        string clusterName,
        Guid credentialId,
        CancellationToken cancellationToken)
    {
        var cluster = await FindClusterAsync(clusters, clusterName, cancellationToken).ConfigureAwait(false);
        if (cluster.IsFailure)
        {
            return cluster.Error;
        }

        var credential = await credentials.GetByIdAsync(new CredentialId(credentialId), cancellationToken).ConfigureAwait(false);
        if (credential is null || credential.ClusterId != cluster.Value.Id)
        {
            return CredentialErrors.NotFound();
        }

        return (cluster.Value, credential);
    }
}
