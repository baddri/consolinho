using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Infrastructure.Kubernetes;
using Microsoft.AspNetCore.Http;

namespace FleetConsole.Api.Tests.Kubernetes;

/// <summary>
/// <see cref="ClusterProbeClient"/> against <see cref="FakeKubeApiServer"/> with real TLS: success paths and JSON
/// parsing, HTTP status mapping, TLS failure categories, network failures, timeouts, and token hygiene (QG-2).
/// No database or container needed.
/// </summary>
public sealed class ClusterProbeClientTests
{
    /// <summary>Obviously fake token; unique enough that finding it anywhere means it leaked.</summary>
    private const string Token = "fake-sa-token-T0010-do-not-leak";

    private readonly RecordingLogger<ClusterProbeClient> _logger = new();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private ClusterProbeClient CreateClient(TimeSpan? requestTimeout = null) =>
        new(new ClusterTlsHandlerFactory(), _logger, requestTimeout ?? TimeSpan.FromSeconds(10));

    private IClusterProbeSession Open(FakeKubeApiServer server, bool withCaBundle = true, bool skipTlsVerify = false, TimeSpan? requestTimeout = null) =>
        CreateClient(requestTimeout).Open(
            new ClusterConnection(server.BaseAddress, withCaBundle ? server.CaBundlePem : null, skipTlsVerify),
            new SensitiveString(Token));

    // ---- success and parsing -------------------------------------------------------------------------------------

    [Fact]
    public async Task GetVersion_WithCaBundle_ReturnsGitVersion_AndSendsBearerToken()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion("v1.31.4");
        await using var session = Open(server);

        var response = await session.GetVersionAsync(Ct);

        response.IsSuccess.ShouldBeTrue(response.Failure?.ToString());
        response.Value.GitVersion.ShouldBe("v1.31.4");
        var request = server.Requests.ShouldHaveSingleItem();
        request.Method.ShouldBe("GET");
        request.Path.ShouldBe("/version");
        request.Authorization.ShouldBe($"Bearer {Token}");
    }

    [Fact]
    public async Task ApiUrlWithPathPrefix_ResolvesRequestsUnderThePrefix()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", "/prefix/version", 200, new { gitVersion = "v1.30.0" });
        await using var session = CreateClient().Open(
            new ClusterConnection(new Uri(server.BaseAddress, "prefix"), server.CaBundlePem, SkipTlsVerify: false),
            new SensitiveString(Token));

        var response = await session.GetVersionAsync(Ct);

        response.Value.ShouldNotBeNull().GitVersion.ShouldBe("v1.30.0");
    }

    [Fact]
    public async Task GetSelfSubjectReview_ParsesUsernameAndGroups()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapSelfSubjectReview("system:serviceaccount:fleet:console", "system:serviceaccounts", "system:authenticated");
        await using var session = Open(server);

        var response = await session.GetSelfSubjectReviewAsync(Ct);

        response.IsSuccess.ShouldBeTrue(response.Failure?.ToString());
        response.Value.Username.ShouldBe("system:serviceaccount:fleet:console");
        response.Value.Groups.ShouldBe(["system:serviceaccounts", "system:authenticated"]);
        var request = server.Requests.ShouldHaveSingleItem();
        request.Method.ShouldBe("POST");
        using var body = JsonDocument.Parse(request.Body);
        body.RootElement.GetProperty("kind").GetString().ShouldBe("SelfSubjectReview");
        body.RootElement.GetProperty("apiVersion").GetString().ShouldBe("authentication.k8s.io/v1");
    }

    [Fact]
    public async Task GetServedApiGroups_ReturnsGroupNames()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapApiGroups("apps", "config.openshift.io");
        await using var session = Open(server);

        var response = await session.GetServedApiGroupsAsync(Ct);

        response.IsSuccess.ShouldBeTrue(response.Failure?.ToString());
        response.Value.Names.ShouldBe(["apps", "config.openshift.io"], ignoreOrder: true);
        server.Requests.ShouldHaveSingleItem().Path.ShouldBe("/apis");
    }

    [Fact]
    public async Task GetServedApiGroups_EmptyListIsAnEmptySet()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapApiGroups();
        await using var session = Open(server);

        var response = await session.GetServedApiGroupsAsync(Ct);

        response.IsSuccess.ShouldBeTrue(response.Failure?.ToString());
        response.Value.Names.ShouldBeEmpty();
    }

    [Fact]
    public async Task GetServedApiGroups_Forbidden_IsAFailureWithKind()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", "/apis", 403);
        await using var session = Open(server);

        var response = await session.GetServedApiGroupsAsync(Ct);

        response.IsSuccess.ShouldBeFalse();
        response.Failure.Kind.ShouldBe(ProbeFailureKind.Forbidden);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task GetClusterVersion_ParsesDesiredVersionAndProgressing(bool progressing)
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapClusterVersion("4.17.3", progressing);
        await using var session = Open(server);

        var response = await session.GetClusterVersionAsync(Ct);

        response.Value.ShouldBe(new ClusterVersionInfo("4.17.3", progressing));
    }

    [Fact]
    public async Task ReviewAccess_SendsResourceAttributes_AndParsesAnswer()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.SetAccessReview("patch", "apps", "deployments", allowed: true, reason: "RBAC: allowed by ClusterRoleBinding \"edit\"");
        server.SetAccessReview("get", "", "pods", allowed: true, subresource: "log", namespaceName: "team-a");
        await using var session = Open(server);

        var allowed = await session.ReviewAccessAsync(new ResourceAttributes("patch", "apps", "deployments"), Ct);
        var withSubresource = await session.ReviewAccessAsync(new ResourceAttributes("get", "", "pods", "log", "team-a"), Ct);
        var denied = await session.ReviewAccessAsync(new ResourceAttributes("delete", "", "namespaces"), Ct);

        allowed.Value.ShouldBe(new AccessReviewResult(true, "RBAC: allowed by ClusterRoleBinding \"edit\""));
        withSubresource.Value.ShouldBe(new AccessReviewResult(true, null));
        denied.Value.ShouldBe(new AccessReviewResult(false, null));

        // The core group is sent as an explicit empty string; absent namespace/subresource are omitted.
        using var body = JsonDocument.Parse(server.Requests[2].Body);
        body.RootElement.GetProperty("kind").GetString().ShouldBe("SelfSubjectAccessReview");
        var attributes = body.RootElement.GetProperty("spec").GetProperty("resourceAttributes");
        attributes.GetProperty("group").GetString().ShouldBe("");
        attributes.TryGetProperty("namespace", out _).ShouldBeFalse();
        attributes.TryGetProperty("subresource", out _).ShouldBeFalse();
    }

    [Fact]
    public async Task ReviewRules_SendsNamespace_AndParsesRules()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapRulesReview(
            incomplete: true, evaluationError: "webhook authorizer unavailable",
            (["get", "list", "watch"], [""], ["pods", "pods/log"], []),
            (["patch"], ["apps"], ["deployments"], ["web"]));
        await using var session = Open(server);

        var response = await session.ReviewRulesAsync("team-a", Ct);

        response.IsSuccess.ShouldBeTrue(response.Failure?.ToString());
        response.Value.Incomplete.ShouldBeTrue();
        response.Value.EvaluationError.ShouldBe("webhook authorizer unavailable");
        response.Value.Rules.Count.ShouldBe(2);
        response.Value.Rules[0].Verbs.ShouldBe(["get", "list", "watch"]);
        response.Value.Rules[0].ApiGroups.ShouldBe([""]);
        response.Value.Rules[0].Resources.ShouldBe(["pods", "pods/log"]);
        response.Value.Rules[0].ResourceNames.ShouldBeEmpty();
        response.Value.Rules[1].ResourceNames.ShouldBe(["web"]);
        using var body = JsonDocument.Parse(server.Requests.ShouldHaveSingleItem().Body);
        body.RootElement.GetProperty("spec").GetProperty("namespace").GetString().ShouldBe("team-a");
    }

    // ---- HTTP status and body mapping ----------------------------------------------------------------------------

    [Theory]
    [InlineData(401, ProbeFailureKind.Unauthorized)]
    [InlineData(403, ProbeFailureKind.Forbidden)]
    [InlineData(404, ProbeFailureKind.NotFound)]
    [InlineData(500, ProbeFailureKind.UnexpectedStatus)]
    [InlineData(429, ProbeFailureKind.UnexpectedStatus)]
    public async Task NonSuccessStatus_IsCategorized(int statusCode, ProbeFailureKind expected)
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", "/version", statusCode, new { kind = "Status", message = "secret-ish server detail" });
        await using var session = Open(server);

        var response = await session.GetVersionAsync(Ct);

        response.IsSuccess.ShouldBeFalse();
        response.Failure.Kind.ShouldBe(expected);
        response.Failure.Message.ShouldNotContain("secret-ish server detail"); // bodies are never echoed
    }

    [Fact]
    public async Task UnscriptedEndpoint_IsNotFound()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        await using var session = Open(server);

        var response = await session.GetClusterVersionAsync(Ct);

        response.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.NotFound);
    }

    [Fact]
    public async Task NonJsonBody_IsInvalidResponse()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapGet("/version", context =>
        {
            context.Response.ContentType = "text/html";
            return context.Response.WriteAsync("<html>Welcome to nginx</html>", context.RequestAborted);
        });
        await using var session = Open(server);

        var response = await session.GetVersionAsync(Ct);

        response.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.InvalidResponse);
    }

    [Fact]
    public async Task JsonWithoutRequiredField_IsInvalidResponse()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", "/version", 200, new { hello = "world" });
        await using var session = Open(server);

        var response = await session.GetVersionAsync(Ct);

        response.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.InvalidResponse);
    }

    // ---- TLS -----------------------------------------------------------------------------------------------------

    [Fact]
    public async Task NoCaBundle_SelfSignedCa_IsUnknownAuthority()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion();
        await using var session = Open(server, withCaBundle: false);

        var response = await session.GetVersionAsync(Ct);

        response.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.TlsUnknownAuthority);
        server.Requests.ShouldBeEmpty(); // the handshake failed before any HTTP request (and token) was sent
    }

    [Fact]
    public async Task WrongCaBundle_IsUnknownAuthority()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        using var otherAuthority = new TestCertificateAuthority("Some Other CA");
        await using var session = CreateClient().Open(
            new ClusterConnection(server.BaseAddress, otherAuthority.CertificatePem, SkipTlsVerify: false),
            new SensitiveString(Token));

        var response = await session.GetVersionAsync(Ct);

        response.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.TlsUnknownAuthority);
    }

    [Fact]
    public async Task CertificateForAnotherHost_IsHostnameMismatch()
    {
        await using var server = await FakeKubeApiServer.StartAsync(FakeServerCertificate.WrongHost, Ct);
        server.MapVersion();
        await using var session = Open(server);

        var response = await session.GetVersionAsync(Ct);

        response.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.TlsHostnameMismatch);
        response.Failure.Message.ShouldContain("127.0.0.1");
    }

    [Fact]
    public async Task ExpiredCertificate_IsCertificateExpired()
    {
        await using var server = await FakeKubeApiServer.StartAsync(FakeServerCertificate.Expired, Ct);
        server.MapVersion();
        await using var session = Open(server);

        var response = await session.GetVersionAsync(Ct);

        response.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.TlsCertificateExpired);
    }

    [Theory]
    [InlineData(FakeServerCertificate.Valid)]
    [InlineData(FakeServerCertificate.Expired)]
    [InlineData(FakeServerCertificate.WrongHost)]
    public async Task SkipTlsVerify_AcceptsAnyCertificate(FakeServerCertificate certificate)
    {
        await using var server = await FakeKubeApiServer.StartAsync(certificate, Ct);
        server.MapVersion("v1.29.1");
        await using var session = Open(server, withCaBundle: false, skipTlsVerify: true);

        var response = await session.GetVersionAsync(Ct);

        response.Value.ShouldNotBeNull().GitVersion.ShouldBe("v1.29.1");
    }

    [Fact]
    public async Task UnreadableCaBundle_FailsEveryCallAsTlsOther()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        await using var session = CreateClient().Open(
            new ClusterConnection(server.BaseAddress, "not a PEM bundle", SkipTlsVerify: false),
            new SensitiveString(Token));

        var response = await session.GetVersionAsync(Ct);

        response.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.TlsOther);
        server.Requests.ShouldBeEmpty();
    }

    [Fact]
    public async Task SkipTlsVerify_DoesNotRecordToleratedCertificateProblems()
    {
        // A later handshake failure in skip mode must classify as TlsOther, not as the tolerated problem.
        await using var server = await FakeKubeApiServer.StartAsync(FakeServerCertificate.Expired, Ct);
        server.MapVersion();
        using var tlsHandler = new ClusterTlsHandlerFactory().Create(new ClusterConnection(server.BaseAddress, null, SkipTlsVerify: true));
        using var client = new HttpClient(tlsHandler.Handler, disposeHandler: false) { BaseAddress = server.BaseAddress };

        using var response = await client.GetAsync(new Uri("version", UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        tlsHandler.Tls.Classify().ShouldBeNull();
    }

    // ---- API URL guard -------------------------------------------------------------------------------------------

    [Fact]
    public async Task HttpApiUrl_IsRejected_AndNoRequestReachesTheListener()
    {
        // Plain TCP listener: an http:// request would be visible as a pending connection.
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        try
        {
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;

            Should.Throw<ArgumentException>(() => CreateClient().Open(
                new ClusterConnection(new Uri($"http://127.0.0.1:{port}/"), null, SkipTlsVerify: true), new SensitiveString(Token)));

            await Task.Delay(200, Ct); // give a (wrongly) started request time to connect
            listener.Pending().ShouldBeFalse();
        }
        finally
        {
            listener.Stop();
        }

        // Also against the fake server's own port: nothing recorded.
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var httpUrl = new UriBuilder(server.BaseAddress) { Scheme = Uri.UriSchemeHttp }.Uri;
        Should.Throw<ArgumentException>(() => CreateClient().Open(
            new ClusterConnection(httpUrl, server.CaBundlePem, SkipTlsVerify: false), new SensitiveString(Token)));
        server.Requests.ShouldBeEmpty();
    }

    [Fact]
    public void RelativeApiUrl_IsRejected()
    {
        Should.Throw<ArgumentException>(() => CreateClient().Open(
            new ClusterConnection(new Uri("/api", UriKind.Relative), null, SkipTlsVerify: false), new SensitiveString(Token)));
    }

    // ---- network and timeouts ------------------------------------------------------------------------------------

    [Fact]
    public async Task ClosedPort_IsConnectionRefused()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        await using var session = CreateClient().Open(
            new ClusterConnection(new Uri($"https://127.0.0.1:{port}"), null, SkipTlsVerify: false), new SensitiveString(Token));

        var response = await session.GetVersionAsync(Ct);

        response.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.ConnectionRefused);
    }

    [Fact]
    public async Task UnresolvableHost_IsDnsFailure()
    {
        // RFC 6761: ".invalid" never resolves.
        await using var session = CreateClient().Open(
            new ClusterConnection(new Uri("https://api.fleetconsole-test.invalid:6443"), null, SkipTlsVerify: false),
            new SensitiveString(Token));

        var response = await session.GetVersionAsync(Ct);

        response.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.DnsFailure);
        response.Failure.Message.ShouldContain("api.fleetconsole-test.invalid");
    }

    [Fact]
    public async Task ServerSlowerThanRequestTimeout_IsTimeout()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapGet("/version", async context => await Task.Delay(TimeSpan.FromSeconds(30), context.RequestAborted));
        await using var session = Open(server, requestTimeout: TimeSpan.FromMilliseconds(300));

        var response = await session.GetVersionAsync(Ct);

        response.Failure.ShouldNotBeNull().Kind.ShouldBe(ProbeFailureKind.Timeout);
    }

    [Fact]
    public async Task CallerCancellation_Propagates()
    {
        // The connection test enforces its overall budget with its own token and maps that cancellation to a timeout
        // itself (T-0020); the adapter must not swallow it.
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapGet("/version", async context => await Task.Delay(TimeSpan.FromSeconds(30), context.RequestAborted));
        await using var session = Open(server);
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        budget.CancelAfter(TimeSpan.FromMilliseconds(300));

        await Should.ThrowAsync<OperationCanceledException>(() => session.GetVersionAsync(budget.Token));
    }

    // ---- token hygiene (QG-2 groundwork) -------------------------------------------------------------------------

    [Fact]
    public async Task Token_NeverAppearsInLogsOrFailureMessages()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", "/version", 401);
        server.MapGet(FakeKubeApiServer.ClusterVersionPath, context =>
        {
            // A misbehaving server echoing the Authorization header back must not leak it either.
            context.Response.ContentType = "text/plain";
            return context.Response.WriteAsync($"bad request, you sent {context.Request.Headers.Authorization}", context.RequestAborted);
        });
        var failures = new List<ProbeFailure?>();

        await using (var session = Open(server))
        {
            failures.Add((await session.GetVersionAsync(Ct)).Failure);
            failures.Add((await session.GetClusterVersionAsync(Ct)).Failure);
            failures.Add((await session.GetSelfSubjectReviewAsync(Ct)).Failure);
        }

        await using (var untrusted = Open(server, withCaBundle: false))
        {
            failures.Add((await untrusted.GetVersionAsync(Ct)).Failure);
        }

        await using (var session = Open(server, requestTimeout: TimeSpan.FromMilliseconds(1)))
        {
            failures.Add((await session.GetVersionAsync(Ct)).Failure);
        }

        failures.ShouldAllBe(failure => failure != null);
        server.Requests.ShouldAllBe(request => request.Authorization == $"Bearer {Token}");
        _logger.Entries.ShouldNotBeEmpty();
        _logger.AllText.ShouldNotContain(Token);
        string.Join('\n', failures.Select(failure => failure!.ToString())).ShouldNotContain(Token);
    }
}
