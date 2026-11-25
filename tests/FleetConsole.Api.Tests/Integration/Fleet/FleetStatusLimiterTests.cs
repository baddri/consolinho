using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Domain.Clusters;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace FleetConsole.Api.Tests.Integration.Fleet;

/// <summary>
/// The pod-wide <c>fleet-status</c> limiter (ADR-0041 §5): with one slot and no queue, a second request while the first
/// stream is still computing gets 503 <c>Fleet.Busy</c> with <c>Retry-After: 5</c>; authentication still runs first, so
/// an anonymous request is a 401 even while saturated; an aborted or completed stream frees its slot.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class FleetStatusLimiterTests(ApiFactory factory) : IAsyncLifetime
{
    private readonly GatedHealthReader _reader = new();
    private ApiFactory _host = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() =>
        _host = await factory.CreateVariantAsync(
            new Dictionary<string, string?>
            {
                ["Fleet:MaxConcurrentRequests"] = "1",
                ["Fleet:RequestQueueLimit"] = "0",
                ["Fleet:CacheDuration"] = "00:00:01",
            },
            configureServices: services =>
            {
                services.RemoveAll<IClusterHealthReader>();
                services.AddSingleton<IClusterHealthReader>(_reader);
            });

    public async ValueTask DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public async Task SecondRequestWhileSaturated_Is503FleetBusy_AnonymousStill401()
    {
        using var holder = await GrantedClientAsync();
        using var other = await GrantedClientAsync();

        using var held = await StartHeldStreamAsync(holder);

        using (var busy = await other.GetAsync(FleetStatusEndpointTests.StatusUri, HttpCompletionOption.ResponseHeadersRead, Ct))
        {
            busy.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
            busy.Headers.RetryAfter?.Delta.ShouldBe(TimeSpan.FromSeconds(5));
            var problem = await busy.Content.ReadFromJsonAsync<JsonElement>(Ct);
            problem.GetProperty("code").GetString().ShouldBe("Fleet.Busy");
            problem.GetProperty("status").GetInt32().ShouldBe(503);
        }

        using (var anonymous = _host.CreateApiClient())
        using (var response = await anonymous.GetAsync(FleetStatusEndpointTests.StatusUri, Ct))
        {
            response.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        }

        _reader.Release();
        var line = await new StreamReader(await held.Content.ReadAsStreamAsync(Ct)).ReadToEndAsync(Ct);
        JsonDocument.Parse(line).RootElement.GetProperty("failure").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Fact]
    public async Task AbortedStream_FreesItsSlot()
    {
        using var holder = await GrantedClientAsync();
        using var other = await GrantedClientAsync();
        var held = await StartHeldStreamAsync(holder);

        // Client goes away mid-stream: the request is aborted, the probes are cancelled and the permit returns.
        held.Dispose();
        holder.CancelPendingRequests();

        // The gate stays closed: the slot can only have come back through the abort, not through a finished stream.
        using var response = await RetryWhileBusyAsync(other);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        _reader.Release();
    }

    // T-0325 (architect's suggestion): a stream that runs to its end returns its permit too, so normal page loads never
    // leak slots until the pod answers only 503.
    [Fact]
    public async Task CompletedStream_FreesItsSlot()
    {
        using var holder = await GrantedClientAsync();
        using var other = await GrantedClientAsync();
        using (var held = await StartHeldStreamAsync(holder))
        {
            _reader.Release();
            var body = await held.Content.ReadAsStringAsync(Ct);
            JsonDocument.Parse(body).RootElement.GetProperty("failure").ValueKind.ShouldBe(JsonValueKind.Null);
        }

        // The gate is open now, so a request that got a slot completes; one that never gets a slot stays 503.
        using var response = await RetryWhileBusyAsync(other);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await response.Content.ReadAsStringAsync(Ct)).ShouldEndWith("\n");
    }

    private async Task<HttpClient> GrantedClientAsync()
    {
        var username = _host.NewUsername();
        await _host.Data.UserAsync(username);
        var cluster = await _host.Data.ClusterAsync(distribution: ClusterDistribution.Kubernetes);
        var credential = await _host.Data.CredentialAsync(cluster.Name);
        await _host.Data.GrantAsync(username, cluster.Name, credential.Id);
        return await _host.LoginAsAsync(username);
    }

    /// <summary>Starts a stream whose only cluster's probe waits on the gate, and returns once the probe has begun.</summary>
    private async Task<HttpResponseMessage> StartHeldStreamAsync(HttpClient client)
    {
        _reader.Close();
        var response = await client.GetAsync(FleetStatusEndpointTests.StatusUri, HttpCompletionOption.ResponseHeadersRead, Ct)
            .WaitAsync(TimeSpan.FromSeconds(15), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        await _reader.Entered.WaitAsync(TimeSpan.FromSeconds(15), Ct);
        return response;
    }

    private static async Task<HttpResponseMessage> RetryWhileBusyAsync(HttpClient client)
    {
        // The abort reaches the server asynchronously; poll briefly instead of sleeping a fixed time. Headers only: the
        // stream itself would wait on the closed gate.
        for (var attempt = 0; ; attempt++)
        {
            var response = await client.GetAsync(FleetStatusEndpointTests.StatusUri, HttpCompletionOption.ResponseHeadersRead, Ct);
            if (response.StatusCode != HttpStatusCode.ServiceUnavailable || attempt == 50)
            {
                return response;
            }

            response.Dispose();
            await Task.Delay(100, Ct);
        }
    }

    /// <summary>
    /// Stands in for the Infrastructure reader: while closed, a read signals <see cref="Entered"/> and waits (honouring
    /// cancellation) until <see cref="Release"/>; then it answers a healthy Kubernetes cluster.
    /// </summary>
    private sealed class GatedHealthReader : IClusterHealthReader
    {
        private TaskCompletionSource _entered = NewSignal();
        private TaskCompletionSource _gate = NewSignal();

        public Task Entered => _entered.Task;

        public void Close()
        {
            _entered = NewSignal();
            _gate = NewSignal();
        }

        public void Release() => _gate.TrySetResult();

        public async Task<ClusterHealthReading> ReadAsync(
            ClusterId clusterId, ClusterConnection connection, ClusterDistribution distribution, SensitiveString token,
            CancellationToken cancellationToken)
        {
            _entered.TrySetResult();
            await _gate.Task.WaitAsync(cancellationToken);
            return new ClusterHealthReading(
                ProbeResponse<KubernetesVersionFacts>.Ok(new KubernetesVersionFacts("v1.31.4")),
                ClusterVersion: null,
                ClusterOperators: null,
                ProbeResponse<NodeCounts>.Ok(new NodeCounts(Total: 1, Ready: 1, Unschedulable: 0)));
        }

        private static TaskCompletionSource NewSignal() => new(TaskCreationOptions.RunContinuationsAsynchronously);
    }
}
