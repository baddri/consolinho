using FleetConsole.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Testcontainers.PostgreSql;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// Hosts the real Api in-process (<see cref="WebApplicationFactory{TEntryPoint}"/>) against a throwaway PostgreSQL
/// container (Testcontainers). Shared by every integration test class through <see cref="ApiCollectionDefinition"/>, so the
/// container and host start once per test run.
/// </summary>
/// <remarks>
/// <para>Runs in the Development environment, like <c>aspire run</c>: migrations are applied on startup by the
/// Infrastructure's development migrator, and <c>/openapi/v1.json</c> and the health endpoints are mapped.</para>
/// <para>Container runtime: Testcontainers talks to whatever <c>DOCKER_HOST</c> points at. On the dev machine that is
/// podman (<c>DOCKER_HOST=unix:///run/user/$UID/podman/podman.sock</c>, <c>TESTCONTAINERS_RYUK_DISABLED=true</c>).</para>
/// <para>Tests share one database. Tests that write data must use unique values (or clean up after themselves)
/// rather than assume an empty database.</para>
/// </remarks>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    /// <summary>Same image as the Aspire AppHost uses, fully qualified because podman rejects ambiguous short names.</summary>
    private const string PostgresImage = "docker.io/library/postgres:18.3";

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder(PostgresImage).Build();

    /// <summary>Connection string of the test database (for tests that inspect the database directly).</summary>
    public string ConnectionString => _postgres.GetConnectionString();

    /// <summary>Starts the PostgreSQL container; xUnit calls this before the first test of the collection.</summary>
    /// <returns>A task that completes when the database accepts connections.</returns>
    public async ValueTask InitializeAsync() =>
        await _postgres.StartAsync(TestContext.Current.CancellationToken).ConfigureAwait(false);

    /// <summary>Creates a client for the in-process Api. Redirects are not followed so tests see them.</summary>
    /// <returns>An <see cref="HttpClient"/> whose base address is the test server.</returns>
    public HttpClient CreateApiClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    /// <summary>Stops the host first (it holds connections), then removes the container.</summary>
    /// <returns>A task that completes when everything is disposed.</returns>
    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync().ConfigureAwait(false);
        await _postgres.DisposeAsync().ConfigureAwait(false);
    }

    /// <inheritdoc />
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        // Same key the Aspire AppHost injects (ConnectionStrings__consoledb). Infrastructure reads it lazily, when the
        // first DbContext is created, so setting it here is early enough.
        builder.UseSetting($"ConnectionStrings:{ConsoleDbContext.ConnectionName}", _postgres.GetConnectionString());
    }
}
