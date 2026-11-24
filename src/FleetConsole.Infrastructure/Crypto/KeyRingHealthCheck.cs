using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace FleetConsole.Infrastructure.Crypto;

/// <summary>
/// Readiness check <c>keyring</c> (<see cref="DependencyInjection.KeyRingHealthCheckName"/>): Unhealthy until this
/// pod's <see cref="KeyRingWarmupService"/> has loaded the Data Protection key ring, Healthy forever after.
/// </summary>
/// <remarks>
/// Keeps a starting replica out of the Service until it shares the one key ring, so it can unprotect every session
/// cookie and SA token another replica issued (ADR-0030 amendment 2026-11-24). Untagged, so only <c>/health</c>
/// (readiness) runs it; <c>/alive</c> stays dependency-free (PRB-2: a database outage must never restart the pod).
/// </remarks>
/// <param name="state">The warm-up's shared state.</param>
internal sealed class KeyRingHealthCheck(KeyRingWarmupState state) : IHealthCheck
{
    /// <inheritdoc />
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default) =>
        Task.FromResult(state.IsLoaded
            ? HealthCheckResult.Healthy()
            : HealthCheckResult.Unhealthy("Key ring not loaded yet"));
}
