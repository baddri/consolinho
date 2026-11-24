using Testcontainers.Redis;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// One throwaway Redis container (Testcontainers) for the query cache's L2 + backplane (ADR-0040 §7). The default
/// <see cref="ApiFactory"/> owns one and gives it to the hosts that run outside Development (Redis is required there);
/// the cache adapter tests start their own.
/// </summary>
/// <remarks>Container runtime: see <see cref="PostgresFixture"/> (podman via <c>DOCKER_HOST</c>).</remarks>
public sealed class RedisFixture : IAsyncDisposable
{
    /// <summary>Same major version as the Aspire AppHost's Redis, fully qualified because podman rejects short names.</summary>
    private const string RedisImage = "docker.io/library/redis:8.0";

    private readonly RedisContainer _container = new RedisBuilder(RedisImage).Build();

    /// <summary>StackExchange.Redis configuration string of the container (<c>host:port</c>, no password).</summary>
    public string ConnectionString => _container.GetConnectionString();

    /// <summary>Starts the container.</summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A task that completes when the server answers PING.</returns>
    public Task StartAsync(CancellationToken cancellationToken) => _container.StartAsync(cancellationToken);

    /// <inheritdoc />
    public ValueTask DisposeAsync() => _container.DisposeAsync();
}
