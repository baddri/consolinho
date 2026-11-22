using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Clusters.RegisterCluster;

/// <summary>
/// Handles <see cref="RegisterClusterCommand"/>: checks the name is free, builds the value objects (already validated by
/// <see cref="RegisterClusterValidator"/>) and stages the new aggregate. <c>UnitOfWorkBehavior</c> commits it with its
/// <c>cluster.registered</c> audit entry; a concurrent registration of the same name is caught there by the unique index
/// (409 <c>Persistence.DuplicateKey</c>).
/// </summary>
/// <param name="clusters">The cluster repository.</param>
/// <param name="currentUser">The acting admin.</param>
/// <param name="clock">Registration time.</param>
internal sealed class RegisterClusterHandler(IClusterRepository clusters, ICurrentUser currentUser, IClock clock)
    : IRequestHandler<RegisterClusterCommand, Result<string>>
{
    /// <inheritdoc />
    public async Task<Result<string>> Handle(RegisterClusterCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // The validator ran first, so these only fail if it was bypassed; return the error rather than throw.
        var name = ClusterName.Create(request.Name);
        if (name.IsFailure)
        {
            return name.Error;
        }

        var endpoint = ClusterSettingsInput.Endpoint(request);
        if (endpoint.IsFailure)
        {
            return endpoint.Error;
        }

        if (await clusters.ExistsAsync(name.Value, cancellationToken).ConfigureAwait(false))
        {
            return ClusterErrors.NameTaken(name.Value.Value);
        }

        var cluster = Cluster.Register(
            name.Value,
            ClusterSettingsInput.Text(request.DisplayName),
            endpoint.Value,
            request.Environment,
            request.Distribution!.Value, // validated by ClusterSettingsRules
            ClusterSettingsInput.WebConsoleUrl(request.WebConsoleUrl),
            ClusterSettingsInput.Text(request.Description),
            request.IsEnabled,
            ActingAdmin.Username(currentUser),
            clock.UtcNow);
        clusters.Add(cluster);

        return cluster.Name.Value;
    }
}
