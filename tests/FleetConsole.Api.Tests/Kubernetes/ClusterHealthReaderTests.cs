using System.Net;
using System.Net.Sockets;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Domain.Clusters;
using FleetConsole.Infrastructure;
using FleetConsole.Infrastructure.Kubernetes;
using FleetConsole.Infrastructure.Kubernetes.Health;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace FleetConsole.Api.Tests.Kubernetes;

/// <summary>
/// <see cref="ClusterHealthReader"/> (T-0322) over a real <see cref="ClusterForwardingClientPool"/> against
/// <see cref="FakeKubeApiServer"/> with real TLS: the requests it sends (contract §3), Table/ClusterVersion parsing into
/// counts, and the classification of every expected failure. No database or container needed.
/// </summary>
public sealed class ClusterHealthReaderTests : IDisposable
{
    private const string Token = "fake-health-token-T0322";
    private const string TableAccept = "application/json;as=Table;v=v1;g=meta.k8s.io";

    private readonly RecordingLogger<ClusterForwardingClientPool> _poolLogger = new();
    private readonly RecordingLogger<ClusterHealthReader> _logger = new();
    private readonly ClusterForwardingClientPool _pool;
    private readonly ClusterHealthReader _reader;

    public ClusterHealthReaderTests()
    {
        _pool = new ClusterForwardingClientPool(new ClusterTlsHandlerFactory(), TimeProvider.System, _poolLogger);
        _reader = new ClusterHealthReader(_pool, _logger);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public void Dispose() => _pool.Dispose();

    private static ClusterConnection Trusting(FakeKubeApiServer server) =>
        new(server.BaseAddress, server.CaBundlePem, SkipTlsVerify: false);

    private Task<ClusterHealthReading> ReadAsync(
        ClusterConnection connection, ClusterDistribution distribution, CancellationToken? cancellationToken = null) =>
        _reader.ReadAsync(new ClusterId(Guid.NewGuid()), connection, distribution, new SensitiveString(Token), cancellationToken ?? Ct);

    // ---- OpenShift ------------------------------------------------------------------------------------------------

    [Fact]
    public async Task OpenShift_ParsesClusterVersionOperatorsAndNodes_WithTableRequests()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapClusterVersion(
            "4.17.5", progressing: true, failing: true,
            history: [("Partial", "4.17.5"), ("Completed", "4.17.3"), ("Completed", "4.16.9")], availableUpdates: 2);
        server.MapClusterOperatorsTable(
            ("True", "False", "False"),
            ("False", "False", "True"),
            ("Unknown", "True", "False"),
            ("", "False", "False"));
        server.MapNodesTable("Ready", "NotReady", "Unknown", "Ready,SchedulingDisabled", "NotReady,SchedulingDisabled");

        var reading = await ReadAsync(Trusting(server), ClusterDistribution.OpenShift);

        reading.KubernetesVersion.ShouldBeNull();
        reading.ClusterVersion.ShouldNotBeNull().Value.ShouldBe(new ClusterVersionFacts(
            CurrentVersion: "4.17.3", DesiredVersion: "4.17.5", Available: true, Progressing: true, Failing: true, AvailableUpdates: 2));
        reading.ClusterOperators.ShouldNotBeNull().Value.ShouldBe(
            new ClusterOperatorCounts(Total: 4, Degraded: 1, Unavailable: 3, Progressing: 1));
        reading.Nodes.Value.ShouldBe(new NodeCounts(Total: 5, Ready: 2, Unschedulable: 2));

        var requests = server.Requests;
        requests.Select(r => r.Path).ShouldBe(
            [FakeKubeApiServer.ClusterVersionPath, FakeKubeApiServer.ClusterOperatorsPath, FakeKubeApiServer.NodesPath],
            ignoreOrder: true);
        requests.ShouldAllBe(r => r.Method == "GET" && r.Authorization == $"Bearer {Token}");
        foreach (var table in requests.Where(r => r.Path != FakeKubeApiServer.ClusterVersionPath))
        {
            table.Query.ShouldBe("?includeObject=None");
            table.Headers["Accept"].ShouldBe([TableAccept]);
        }

        var clusterVersion = requests.Single(r => r.Path == FakeKubeApiServer.ClusterVersionPath);
        clusterVersion.Query.ShouldBeEmpty();
        clusterVersion.Headers["Accept"].ShouldBe(["application/json"]);
    }

    [Fact]
    public async Task OpenShift_ClusterVersionWithoutCompletedHistory_UsesDesiredVersion_AndAbsentConditionsAreNull()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", FakeKubeApiServer.ClusterVersionPath, 200, new
        {
            kind = "ClusterVersion",
            status = new { desired = new { version = "4.18.0" }, history = new[] { new { state = "Partial", version = "4.18.0" } } },
        });
        server.MapClusterOperatorsTable();
        server.MapNodesTable();

        var reading = await ReadAsync(Trusting(server), ClusterDistribution.OpenShift);

        reading.ClusterVersion.ShouldNotBeNull().Value.ShouldBe(new ClusterVersionFacts("4.18.0", "4.18.0", null, null, null, 0));
        reading.ClusterOperators.ShouldNotBeNull().Value.ShouldBe(new ClusterOperatorCounts(0, 0, 0, 0));
        reading.Nodes.Value.ShouldBe(new NodeCounts(0, 0, 0));
    }

    [Fact]
    public async Task OpenShift_SectionFailuresAreIndependent()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapClusterVersion();
        server.Respond("GET", FakeKubeApiServer.ClusterOperatorsPath, 403);
        server.MapNodesTable("Ready");

        var reading = await ReadAsync(Trusting(server), ClusterDistribution.OpenShift);

        reading.ClusterVersion.ShouldNotBeNull().IsSuccess.ShouldBeTrue();
        reading.ClusterOperators.ShouldNotBeNull().Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.Forbidden);
        reading.Nodes.Value.ShouldBe(new NodeCounts(1, 1, 0));
    }

    [Fact]
    public async Task OpenShift_ClusterVersionOfWrongKind_IsInvalidResponse()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", FakeKubeApiServer.ClusterVersionPath, 200, new { kind = "Status", status = new { } });
        server.MapClusterOperatorsTable();
        server.MapNodesTable();

        var reading = await ReadAsync(Trusting(server), ClusterDistribution.OpenShift);

        reading.ClusterVersion.ShouldNotBeNull().Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.InvalidResponse);
    }

    // ---- Kubernetes -----------------------------------------------------------------------------------------------

    [Fact]
    public async Task Kubernetes_RequestsOnlyVersionAndNodes()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion("v1.31.4");
        server.MapNodesTable("Ready", "Ready");

        var reading = await ReadAsync(Trusting(server), ClusterDistribution.Kubernetes);

        reading.KubernetesVersion.ShouldNotBeNull().Value.ShouldBe(new KubernetesVersionFacts("v1.31.4"));
        reading.ClusterVersion.ShouldBeNull();
        reading.ClusterOperators.ShouldBeNull();
        reading.Nodes.Value.ShouldBe(new NodeCounts(2, 2, 0));
        server.Requests.Select(r => r.Path).ShouldBe(["/version", FakeKubeApiServer.NodesPath], ignoreOrder: true);
    }

    [Fact]
    public async Task PathPrefixOfTheApiUrl_IsKept()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", "/prefix/version", 200, new { gitVersion = "v1.30.0" });
        server.Respond("GET", "/prefix" + FakeKubeApiServer.NodesPath, 200,
            FakeKubeApiServer.Table(["Name", "Status"], [["node-0", "Ready"]]));

        var reading = await ReadAsync(
            new ClusterConnection(new Uri(server.BaseAddress, "prefix"), server.CaBundlePem, SkipTlsVerify: false),
            ClusterDistribution.Kubernetes);

        reading.KubernetesVersion.ShouldNotBeNull().IsSuccess.ShouldBeTrue();
        reading.Nodes.Value.ShouldBe(new NodeCounts(1, 1, 0));
    }

    // ---- status and body failures ---------------------------------------------------------------------------------

    [Theory]
    [InlineData(401, ProbeFailureKind.Unauthorized)]
    [InlineData(403, ProbeFailureKind.Forbidden)]
    [InlineData(404, ProbeFailureKind.NotFound)]
    [InlineData(500, ProbeFailureKind.UnexpectedStatus)]
    public async Task Status_IsClassified(int status, ProbeFailureKind expected)
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion();
        server.Respond("GET", FakeKubeApiServer.NodesPath, status);

        var reading = await ReadAsync(Trusting(server), ClusterDistribution.Kubernetes);

        reading.KubernetesVersion.ShouldNotBeNull().IsSuccess.ShouldBeTrue();
        var failure = reading.Nodes.Failure.ShouldNotBeNull();
        failure.Kind.ShouldBe(expected);
        failure.Message.ShouldNotContain("fake-kube-apiserver"); // the upstream Status message never leaks
        _logger.AllText.ShouldContain(expected.ToString());
        _logger.AllText.ShouldNotContain(Token);
    }

    [Fact]
    public async Task Html200_IsInvalidResponse()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion();
        server.MapGet(FakeKubeApiServer.NodesPath, async context =>
        {
            context.Response.ContentType = "text/html";
            await context.Response.WriteAsync("<html><body>Application is not available</body></html>", context.RequestAborted);
        });

        var reading = await ReadAsync(Trusting(server), ClusterDistribution.Kubernetes);

        var failure = reading.Nodes.Failure.ShouldNotBeNull();
        failure.Kind.ShouldBe(ProbeFailureKind.InvalidResponse);
        failure.Message.ShouldNotContain("Application is not available");
        _logger.AllText.ShouldNotContain("Application is not available");
    }

    [Fact]
    public async Task TableWithoutStatusColumn_IsInvalidResponse()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion();
        server.Respond("GET", FakeKubeApiServer.NodesPath, 200,
            FakeKubeApiServer.Table(["Name", "Roles"], [["node-0", "worker"]]));

        var reading = await ReadAsync(Trusting(server), ClusterDistribution.Kubernetes);

        reading.Nodes.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.InvalidResponse);
    }

    [Fact]
    public async Task ColumnsAreMatchedByNameCaseInsensitively_NotByPosition()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion();
        server.Respond("GET", FakeKubeApiServer.NodesPath, 200,
            FakeKubeApiServer.Table(["Age", "STATUS", "Name"], [["1d", "Ready,SchedulingDisabled", "a"], ["2d", "NotReady", "b"]]));

        var reading = await ReadAsync(Trusting(server), ClusterDistribution.Kubernetes);

        reading.Nodes.Value.ShouldBe(new NodeCounts(2, 1, 1));
    }

    [Fact]
    public async Task PlainListInsteadOfTable_IsInvalidResponse()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion();
        server.Respond("GET", FakeKubeApiServer.NodesPath, 200, new { kind = "NodeList", apiVersion = "v1", items = Array.Empty<object>() });

        var reading = await ReadAsync(Trusting(server), ClusterDistribution.Kubernetes);

        reading.Nodes.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.InvalidResponse);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task BodyOverFourMebibytes_IsInvalidResponse(bool withContentLength)
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion();
        server.MapGet(FakeKubeApiServer.NodesPath, async context =>
        {
            // A valid-looking Table whose padding pushes it past the cap, so only the size can reject it.
            var padding = new string(' ', ClusterHealthReader.MaxResponseBytes);
            var body = System.Text.Encoding.UTF8.GetBytes(
                $$"""{"kind":"Table","columnDefinitions":[{"name":"Status"}],"rows":[]{{padding}}}""");
            context.Response.ContentType = "application/json";
            if (withContentLength)
            {
                context.Response.ContentLength = body.Length;
            }

            await context.Response.Body.WriteAsync(body, context.RequestAborted);
        });

        var reading = await ReadAsync(Trusting(server), ClusterDistribution.Kubernetes);

        reading.Nodes.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.InvalidResponse);
    }

    // ---- network and TLS ------------------------------------------------------------------------------------------

    [Fact]
    public async Task ClosedPort_IsConnectionRefused()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();

        var reading = await ReadAsync(
            new ClusterConnection(new Uri($"https://127.0.0.1:{port}"), null, SkipTlsVerify: false), ClusterDistribution.Kubernetes);

        reading.KubernetesVersion.ShouldNotBeNull().Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.ConnectionRefused);
        reading.Nodes.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.ConnectionRefused);
    }

    [Fact]
    public async Task SelfSignedCertificateWithoutCa_IsTlsFailure()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion();
        server.MapNodesTable("Ready");

        var reading = await ReadAsync(
            new ClusterConnection(server.BaseAddress, CaBundlePem: null, SkipTlsVerify: false), ClusterDistribution.Kubernetes);

        // The pooled handler is shared, so the reader can't attribute the rejection reason: always TlsOther.
        reading.Nodes.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.TlsOther);
        server.Requests.ShouldBeEmpty();
    }

    [Fact]
    public async Task UnusableCaBundle_FailsEveryProbe_AndLogsOneWarning()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);

        var reading = await ReadAsync(
            new ClusterConnection(server.BaseAddress, "not a PEM bundle", SkipTlsVerify: false), ClusterDistribution.OpenShift);

        reading.ClusterVersion.ShouldNotBeNull().Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.InvalidResponse);
        reading.ClusterOperators.ShouldNotBeNull().Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.InvalidResponse);
        reading.Nodes.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.InvalidResponse);
        reading.KubernetesVersion.ShouldBeNull();
        _logger.Entries.Count(entry => entry.StartsWith("Warning", StringComparison.Ordinal)).ShouldBe(1);
        server.Requests.ShouldBeEmpty();
    }

    // ---- cancellation ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task CallerCancellation_PropagatesAsOperationCanceled()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion();
        server.MapNodesTable("Ready");
        server.Delay("GET", FakeKubeApiServer.NodesPath, TimeSpan.FromSeconds(30));
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        budget.CancelAfter(TimeSpan.FromMilliseconds(300));

        await Should.ThrowAsync<OperationCanceledException>(
            () => ReadAsync(Trusting(server), ClusterDistribution.Kubernetes, budget.Token));
    }

    // ---- registration ---------------------------------------------------------------------------------------------

    [Fact]
    public void AddInfrastructure_RegistersReaderAsSingleton()
    {
        var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings { EnvironmentName = Environments.Production });
        builder.AddInfrastructure();
        using var services = builder.Services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true });

        var reader = services.GetRequiredService<IClusterHealthReader>();

        reader.ShouldBeOfType<ClusterHealthReader>();
        services.GetRequiredService<IClusterHealthReader>().ShouldBeSameAs(reader);
    }
}
