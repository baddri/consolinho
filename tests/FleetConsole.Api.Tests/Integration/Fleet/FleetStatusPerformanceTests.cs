using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Domain.Clusters;

namespace FleetConsole.Api.Tests.Integration.Fleet;

/// <summary>
/// QG5C-4 performance smoke (T-0325): 40 granted clusters — 5 answering after 4 s, 2 unreachable, 33 instant — with the
/// default fleet options (10 clusters at once, 5 s budget). The first line must be readable within 1 s, the whole stream
/// within 6 s, and never more than 10 clusters may be probed upstream at once (<see cref="InFlightGauge"/>).
/// </summary>
/// <remarks>
/// Runs in the normal gate: it costs about 5 s of wall time, comparable to other streaming tests. One warm-up call with
/// another user first, so JIT and the first TLS/pool set-up of the host are not what is measured. The measured numbers
/// are written to the test output.
/// </remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class FleetStatusPerformanceTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Forty_clusters_first_line_under_1s_complete_under_6s_in_flight_at_most_10()
    {
        var gauge = new InFlightGauge();
        var servers = new List<FakeKubeApiServer>();
        try
        {
            await WarmUpAsync();

            var username = factory.NewUsername();
            await factory.Data.UserAsync(username);
            for (var i = 0; i < 38; i++)
            {
                var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
                servers.Add(server);
                gauge.Serve(server, ClusterDistribution.OpenShift, i < 5 ? TimeSpan.FromSeconds(4) : TimeSpan.Zero);
                await GrantAsync(username, server.BaseAddress.ToString(), server.CaBundlePem);
            }

            for (var i = 0; i < 2; i++)
            {
                await GrantAsync(username, ClosedPortUrl(), caBundlePem: null);
            }

            using var client = await factory.LoginAsAsync(username);

            var started = Stopwatch.GetTimestamp();
            using var response = await client.GetAsync(FleetStatusEndpointTests.StatusUri, HttpCompletionOption.ResponseHeadersRead, Ct)
                .WaitAsync(TimeSpan.FromSeconds(15), Ct);
            response.StatusCode.ShouldBe(HttpStatusCode.OK);
            using var reader = new StreamReader(await response.Content.ReadAsStreamAsync(Ct));
            var lines = new List<JsonElement>();
            TimeSpan? firstLine = null;
            while (await reader.ReadLineAsync(Ct).AsTask().WaitAsync(TimeSpan.FromSeconds(15), Ct) is { } line)
            {
                firstLine ??= Stopwatch.GetElapsedTime(started);
                lines.Add(JsonDocument.Parse(line).RootElement);
            }

            var complete = Stopwatch.GetElapsedTime(started);
            TestContext.Current.TestOutputHelper?.WriteLine(
                $"QG5C-4: first line {firstLine?.TotalMilliseconds:F0} ms, complete {complete.TotalMilliseconds:F0} ms, max in flight {gauge.Max}");

            lines.Count.ShouldBe(40);
            lines.Count(l => FleetStatusAcceptanceTests.Failure(l) is null).ShouldBe(38);
            lines.Count(l => FleetStatusAcceptanceTests.Failure(l) == "unreachable").ShouldBe(2);
            firstLine.ShouldNotBeNull().ShouldBeLessThan(TimeSpan.FromSeconds(1));
            complete.ShouldBeLessThan(TimeSpan.FromSeconds(6));
            gauge.Max.ShouldBeLessThanOrEqualTo(10);
        }
        finally
        {
            foreach (var server in servers)
            {
                await server.DisposeAsync();
            }
        }
    }

    private async Task WarmUpAsync()
    {
        await using var server = await FleetStatusAcceptanceTests.HealthyOpenShiftAsync();
        var username = factory.NewUsername();
        await factory.Data.UserAsync(username);
        await GrantAsync(username, server.BaseAddress.ToString(), server.CaBundlePem);
        using var client = await factory.LoginAsAsync(username);
        (await FleetStatusAcceptanceTests.StatusLinesAsync(client)).ShouldHaveSingleItem();
    }

    private async Task GrantAsync(string username, string apiUrl, string? caBundlePem)
    {
        var cluster = await factory.Data.ClusterAsync(apiUrl: apiUrl, caBundlePem: caBundlePem);
        var credential = await factory.Data.CredentialAsync(cluster.Name);
        await factory.Data.GrantAsync(username, cluster.Name, credential.Id);
    }

    private static string ClosedPortUrl()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return $"https://127.0.0.1:{port}";
    }
}
