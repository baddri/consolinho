using Microsoft.Extensions.Options;
using StackExchange.Redis;

namespace FleetConsole.Infrastructure.Caching;

/// <summary>
/// The process's single Redis connection (<see cref="IConnectionMultiplexer"/>), shared by the L2 cache, the backplane
/// and the <c>redis</c> health check (ADR-0040 §7). Connects on first use and is disposed with the container.
/// </summary>
/// <remarks>
/// <c>AbortOnConnectFail = false</c>: a Redis that is down at start (or later) never fails the host; the multiplexer
/// keeps reconnecting in the background while operations fail fast, which FusionCache logs (Warning) and routes around
/// with its circuit breakers — the pod keeps serving from L1 + database (CACHE-7).
/// </remarks>
internal sealed class RedisConnection : IAsyncDisposable
{
    private readonly Lazy<Task<IConnectionMultiplexer>> _multiplexer;

    /// <summary>Prepares (does not open) the connection.</summary>
    /// <param name="options">
    /// The validated connection options; their connection string is a StackExchange.Redis configuration string
    /// (<c>host:port,password=…</c>) — it carries the password, so it is never logged.
    /// </param>
    public RedisConnection(IOptions<RedisConnectionOptions> options)
    {
        ConnectionString = options.Value.ConnectionString;
        _multiplexer = new Lazy<Task<IConnectionMultiplexer>>(ConnectAsync, LazyThreadSafetyMode.ExecutionAndPublication);
    }

    /// <summary>Whether a Redis is configured; without one (Development, tests) the cache is L1-only.</summary>
    public bool IsConfigured => !string.IsNullOrWhiteSpace(ConnectionString);

    private string? ConnectionString { get; }

    /// <summary>
    /// The shared multiplexer, connected on the first call. The shape (<c>Func&lt;Task&lt;…&gt;&gt;</c>) matches the
    /// <c>ConnectionMultiplexerFactory</c> options of the L2 cache and the backplane.
    /// </summary>
    /// <returns>The multiplexer; it may be disconnected (operations then throw <see cref="RedisConnectionException"/>).</returns>
    public Task<IConnectionMultiplexer> GetAsync() => _multiplexer.Value;

    private async Task<IConnectionMultiplexer> ConnectAsync()
    {
        if (!IsConfigured)
        {
            throw new InvalidOperationException("No Redis is configured (ConnectionStrings:redis).");
        }

        var configuration = ConfigurationOptions.Parse(ConnectionString!);
        configuration.AbortOnConnectFail = false;
        return await ConnectionMultiplexer.ConnectAsync(configuration).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        if (_multiplexer.IsValueCreated)
        {
            await (await _multiplexer.Value.ConfigureAwait(false)).DisposeAsync().ConfigureAwait(false);
        }
    }
}
