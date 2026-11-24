using Microsoft.Extensions.Diagnostics.HealthChecks;
using StackExchange.Redis;

namespace FleetConsole.Infrastructure.Caching;

/// <summary>
/// Readiness check <c>redis</c> (<see cref="DependencyInjection.RedisHealthCheckName"/>): PINGs Redis through the shared
/// multiplexer. Reports Healthy or <b>Degraded — never Unhealthy</b>: without Redis a pod still serves correctly from its
/// L1 cache and the database, so it must stay in the Service (<c>/health</c> answers 200 for Degraded; CACHE-7).
/// </summary>
/// <remarks>
/// Untagged, so only <c>/health</c> runs it; <c>/alive</c> stays dependency-free (PRB-2). Healthy when no Redis is
/// configured, which start validation only allows in Development.
/// </remarks>
/// <param name="connection">The shared Redis connection.</param>
internal sealed class RedisHealthCheck(RedisConnection connection) : IHealthCheck
{
    /// <summary>Budget of the PING; well inside the readiness probe's 3 s timeout.</summary>
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(1);

    /// <inheritdoc />
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        if (!connection.IsConfigured)
        {
            return HealthCheckResult.Healthy("No Redis configured (Development): the cache is in-memory only.");
        }

        try
        {
            var multiplexer = await connection.GetAsync().WaitAsync(Timeout, cancellationToken).ConfigureAwait(false);
            await multiplexer.GetDatabase().PingAsync().WaitAsync(Timeout, cancellationToken).ConfigureAwait(false);
            return HealthCheckResult.Healthy();
        }
        catch (Exception exception) when (exception is RedisException or TimeoutException)
        {
            // Description only: the exception text may carry the endpoint, and /health must not leak details anyway.
            return HealthCheckResult.Degraded("Redis unreachable; serving from the in-memory cache and the database.");
        }
    }
}
