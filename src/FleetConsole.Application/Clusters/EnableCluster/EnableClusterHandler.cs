using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Clusters.EnableCluster;

/// <summary>
/// Handles <see cref="EnableClusterCommand"/>: loads the cluster at the client's version and calls
/// <c>Cluster.Enable</c>, which raises <c>ClusterEnabled</c> (audit) only when the state actually changes.
/// </summary>
/// <param name="clusters">The cluster repository.</param>
/// <param name="currentUser">The acting admin.</param>
/// <param name="clock">Change time.</param>
internal sealed class EnableClusterHandler(IClusterRepository clusters, ICurrentUser currentUser, IClock clock)
    : IRequestHandler<EnableClusterCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result> Handle(EnableClusterCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var cluster = await ClusterLookup.FindAtVersionAsync(clusters, request.Name, request.Version, cancellationToken)
            .ConfigureAwait(false);
        if (cluster.IsFailure)
        {
            return cluster;
        }

        cluster.Value.Enable(ActingAdmin.Username(currentUser), clock.UtcNow);
        return Result.Success();
    }
}
