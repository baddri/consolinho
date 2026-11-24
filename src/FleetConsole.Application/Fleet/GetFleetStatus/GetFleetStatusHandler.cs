using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Access;
using FleetConsole.Domain.Common;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FleetConsole.Application.Fleet.GetFleetStatus;

/// <summary>
/// Answers <see cref="GetFleetStatusQuery"/>: resolves the caller's access once from <see cref="ClusterAccessReader"/>
/// (the cached snapshot, exactly as the cluster switcher does; disabled clusters are already excluded) and wraps it in a
/// <see cref="FleetStatusStream"/> that probes the clusters when enumerated.
/// </summary>
/// <remarks>
/// The handler itself sends nothing upstream: a persistence failure while loading access surfaces here, before the
/// first byte is streamed; once streaming, every per-cluster problem is data in its line (ADR-0041 §1). The probe is
/// resolved once and shared by all clusters — no query is dispatched from inside the parallel loop (ADR-0041 §3).
/// </remarks>
/// <param name="reader">Loads and resolves the user's grants.</param>
/// <param name="currentUser">The signed-in user (id and session read-only flag).</param>
/// <param name="probe">Produces one cluster's facts; concurrency-safe.</param>
/// <param name="clock">Stamps lines of clusters whose probe failed unexpectedly.</param>
/// <param name="options">Supplies <see cref="FleetOptions.MaxClusterConcurrency"/>.</param>
/// <param name="logger">Receives unexpected per-cluster probe errors.</param>
internal sealed class GetFleetStatusHandler(
    ClusterAccessReader reader,
    ICurrentUser currentUser,
    IClusterHealthProbe probe,
    IClock clock,
    IOptions<FleetOptions> options,
    ILogger<GetFleetStatusHandler> logger)
    : IRequestHandler<GetFleetStatusQuery, Result<FleetStatusStream>>
{
    /// <inheritdoc />
    public async Task<Result<FleetStatusStream>> Handle(GetFleetStatusQuery request, CancellationToken cancellationToken)
    {
        if (currentUser.UserId is not { } userId)
        {
            // AuthorizationBehavior lets only signed-in users through; nothing to probe without an id.
            return Result.Success(FleetStatusStream.Empty);
        }

        var accesses = await reader.LoadAsync(userId, cluster: null, currentUser.IsReadOnly, cancellationToken).ConfigureAwait(false);
        return Result.Success(new FleetStatusStream(
            accesses, probe, userId, currentUser.IsReadOnly, clock, options.Value.MaxClusterConcurrency, logger));
    }
}
