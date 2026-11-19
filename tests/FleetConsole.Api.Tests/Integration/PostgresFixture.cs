using Npgsql;
using Testcontainers.PostgreSql;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// One throwaway PostgreSQL container (Testcontainers) for the test run. <see cref="ApiFactory"/> owns one and hands it
/// to its variants, so hosts with different configuration each get their own <b>database</b> in the same container
/// instead of a second container.
/// </summary>
/// <remarks>
/// Container runtime: Testcontainers talks to whatever <c>DOCKER_HOST</c> points at. On the dev machine that is podman
/// (<c>DOCKER_HOST=unix:///run/user/$UID/podman/podman.sock</c>, <c>TESTCONTAINERS_RYUK_DISABLED=true</c>). Databases
/// other than the default are created by the Api's development migrator on first start (EF <c>Migrate</c> creates a
/// missing database).
/// </remarks>
public sealed class PostgresFixture : IAsyncDisposable
{
    /// <summary>Same image as the Aspire AppHost uses, fully qualified because podman rejects ambiguous short names.</summary>
    private const string PostgresImage = "docker.io/library/postgres:18.3";

    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder(PostgresImage).Build();

    /// <summary>Connection string of the container's default database.</summary>
    public string ConnectionString => _container.GetConnectionString();

    /// <summary>Starts the container.</summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A task that completes when the server accepts connections.</returns>
    public Task StartAsync(CancellationToken cancellationToken) => _container.StartAsync(cancellationToken);

    /// <summary>Connection string for <paramref name="database"/> on the same server (created on first use by the Api).</summary>
    /// <param name="database">A database name (letters, digits, underscores).</param>
    /// <returns>The connection string.</returns>
    public string ConnectionStringFor(string database) =>
        new NpgsqlConnectionStringBuilder(ConnectionString) { Database = database }.ConnectionString;

    /// <inheritdoc />
    public ValueTask DisposeAsync() => _container.DisposeAsync();
}
