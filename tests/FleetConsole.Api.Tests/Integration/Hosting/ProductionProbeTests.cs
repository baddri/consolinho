using System.Net;
using FleetConsole.Infrastructure.Persistence;

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

    [Fact]
    public async Task DatabaseUnreachable_AliveIs200_HealthIs503()
    {
        // Port 1 on loopback refuses connections immediately: the database check fails, the self check doesn't care.
        await using var host = ProductionHost.Create(factory, new Dictionary<string, string?>
        {
            [$"ConnectionStrings:{ConsoleDbContext.ConnectionName}"] = "Host=127.0.0.1;Port=1;Database=x;Username=x;Password=fake;Timeout=3",
        });
        using var client = host.CreateClient();

        using var alive = await client.GetAsync(new Uri("/alive", UriKind.Relative), Ct);
        using var health = await client.GetAsync(new Uri("/health", UriKind.Relative), Ct);

        alive.StatusCode.ShouldBe(HttpStatusCode.OK);
        health.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
        (await health.Content.ReadAsStringAsync(Ct)).ShouldBe("Unhealthy");
    }
}
