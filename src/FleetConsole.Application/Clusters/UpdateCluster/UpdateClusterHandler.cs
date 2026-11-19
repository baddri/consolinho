using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Clusters.UpdateCluster;

/// <summary>
/// Handles <see cref="UpdateClusterCommand"/>: loads the cluster at the client's version and hands the new values to
/// <c>Cluster.Update</c>, which decides what changed, moves <c>ConnectionSettingsChangedAt</c> for connection changes
/// and raises <c>ClusterUpdated</c> (audit) only when something changed.
/// </summary>
/// <param name="clusters">The cluster repository.</param>
/// <param name="currentUser">The acting admin.</param>
/// <param name="clock">Change time.</param>
internal sealed class UpdateClusterHandler(IClusterRepository clusters, ICurrentUser currentUser, IClock clock)
    : IRequestHandler<UpdateClusterCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result> Handle(UpdateClusterCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var cluster = await ClusterLookup.FindAtVersionAsync(clusters, request.Name, request.Version, cancellationToken)
            .ConfigureAwait(false);
        if (cluster.IsFailure)
        {
            return cluster;
        }

        // Validated by UpdateClusterValidator; a failure here means the pipeline was bypassed.
        var endpoint = ClusterSettingsInput.Endpoint(request);
        if (endpoint.IsFailure)
        {
            return endpoint;
        }

        cluster.Value.Update(
            ClusterSettingsInput.Text(request.DisplayName),
            endpoint.Value,
            request.Environment,
            ClusterSettingsInput.WebConsoleUrl(request.WebConsoleUrl),
            ClusterSettingsInput.Text(request.Description),
            ActingAdmin.Username(currentUser),
            clock.UtcNow);

        return Result.Success();
    }
}
