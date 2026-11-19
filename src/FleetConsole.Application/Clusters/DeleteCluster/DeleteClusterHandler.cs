using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Clusters.DeleteCluster;

/// <summary>
/// Handles <see cref="DeleteClusterCommand"/>: counts the credentials and grants the deletion removes, lets
/// <c>Cluster.MarkForDeletion</c> enforce "disabled only" and raise <c>ClusterDeleted</c> with those counts, then
/// removes the aggregate. The database cascades the delete to credentials and grants (T-0012), so they are not loaded.
/// </summary>
/// <param name="clusters">The cluster repository.</param>
/// <param name="credentials">Counts the cluster's credentials.</param>
/// <param name="grants">Counts the cluster's grants.</param>
internal sealed class DeleteClusterHandler(
    IClusterRepository clusters, ICredentialRepository credentials, IGrantRepository grants)
    : IRequestHandler<DeleteClusterCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result> Handle(DeleteClusterCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var cluster = await ClusterLookup.FindAsync(clusters, request.Name, cancellationToken).ConfigureAwait(false);
        if (cluster.IsFailure)
        {
            return cluster;
        }

        // Counted before the delete for the audit entry; a credential or grant added concurrently is still removed by
        // the cascade, only the audited count would be one short — acceptable for an audit summary.
        var credentialCount = await credentials.CountByClusterAsync(cluster.Value.Id, cancellationToken).ConfigureAwait(false);
        var grantCount = await grants.CountByClusterAsync(cluster.Value.Id, cancellationToken).ConfigureAwait(false);

        var marked = cluster.Value.MarkForDeletion(credentialCount, grantCount);
        if (marked.IsFailure)
        {
            return marked;
        }

        clusters.Remove(cluster.Value);
        return Result.Success();
    }
}
