using System.Diagnostics;
using System.Net;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace FleetConsole.Api.Tests.Integration.Hosting;

/// <summary>
/// PRB-1/PRB-2 (ADR-0028 §2): the kubelet probes work in Production without session or CSRF header, expose only the
/// status word, and separate liveness (no dependencies) from readiness (database).
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProductionProbeTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("GET", "/health")]
    [InlineData("GET", "/alive")]
    [InlineData("POST", "/health")]
    public async Task Probes_AreHealthy_Anonymous_WithoutCsrfHeader_StatusWordOnly(string method, string path)
    {
        await using var host = ProductionHost.Create(factory);
        using var client = host.CreateClient();

        using var request = new HttpRequestMessage(new HttpMethod(method), new Uri(path, UriKind.Relative));
        using var response = await client.SendAsync(request, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await response.Content.ReadAsStringAsync(Ct)).ShouldBe("Healthy");
    }

    /// <summary>
    /// PRB-2 / T-0106: with the database unreachable at start the host must not block on it (the Data Protection
    /// key-ring load used to wait ~60 s for EF's retries before Kestrel bound). <c>/alive</c> answers 200 well within
    /// the startup probe budget (60 s) and <c>/health</c> answers 503 within the readiness probe timeout (3 s).
    /// </summary>
    /// <param name="host">Refused: loopback port 1. Dropped: TEST-NET-1 (RFC 5737), never routed, so connects hang
    /// until the 15 s connect timeout (or fail at once where there is no route).</param>
    [Theory]
    [InlineData("127.0.0.1;Port=1")]
    [InlineData("192.0.2.1;Port=5432")]
    public async Task DatabaseUnreachable_AliveIs200Promptly_HealthIs503Promptly(string host)
    {
        await using var production = ProductionHost.Create(factory, new Dictionary<string, string?>
        {
            [$"ConnectionStrings:{ConsoleDbContext.ConnectionName}"] = $"Host={host};Database=x;Username=x;Password=fake",
        });

        var started = Stopwatch.StartNew();
        using var client = production.CreateClient(); // starts the host
        using var alive = await client.GetAsync(new Uri("/alive", UriKind.Relative), Ct);
        var aliveAfter = started.Elapsed;

        started.Restart();
        using var health = await client.GetAsync(new Uri("/health", UriKind.Relative), Ct);
        var healthAfter = started.Elapsed;

        alive.StatusCode.ShouldBe(HttpStatusCode.OK);
        aliveAfter.ShouldBeLessThan(TimeSpan.FromSeconds(15));
        health.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
        (await health.Content.ReadAsStringAsync(Ct)).ShouldBe("Unhealthy");
        healthAfter.ShouldBeLessThan(TimeSpan.FromSeconds(3));
    }

    /// <summary>
    /// PRB-2 / T-0106: a pod that started during an outage becomes ready once the database is back, without a restart.
    /// The connection string is read per context, so switching it at runtime stands in for the database coming back.
    /// (Data Protection is not exercised here: the background warm-up keeps retrying the old address for ~60 s and
    /// holds the key-ring lock meanwhile — a test artefact; a real database coming back serves its next retry.)
    /// </summary>
    [Fact]
    public async Task DatabaseBackAfterStart_HealthRecovers_WithoutRestart()
    {
        var connectionKey = $"ConnectionStrings:{ConsoleDbContext.ConnectionName}";
        await using var production = ProductionHost.Create(factory, new Dictionary<string, string?>
        {
            [connectionKey] = "Host=127.0.0.1;Port=1;Database=x;Username=x;Password=fake",
        });
        using var client = production.CreateClient();
        using (var down = await client.GetAsync(new Uri("/health", UriKind.Relative), Ct))
        {
            down.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
        }

        production.Services.GetRequiredService<IConfiguration>()[connectionKey] = factory.ConnectionString;

        using var up = await client.GetAsync(new Uri("/health", UriKind.Relative), Ct);
        up.StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    /// <summary>T-0106: the framework's blocking start-time key-ring load is gone, replaced by the background warm-up.</summary>
    [Fact]
    public async Task KeyRingLoad_IsNotOnTheStartupPath()
    {
        await using var production = ProductionHost.Create(factory);

        var hostedServices = production.Services.GetServices<IHostedService>().Select(s => s.GetType().FullName).ToList();

        hostedServices.ShouldNotContain("Microsoft.AspNetCore.DataProtection.Internal.DataProtectionHostedService");
        hostedServices.ShouldContain("FleetConsole.Infrastructure.Crypto.KeyRingWarmupService");
    }
}
