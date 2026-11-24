using System.Diagnostics;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;
using Microsoft.AspNetCore.Http;

namespace FleetConsole.Api.Tests.Integration.Proxy;

/// <summary>
/// QA sweep SEC-4 (CP1 D3/R4 carry-over, extends <see cref="Admin.TokenLeakSweepTests"/> to the proxy): one SA token
/// with a recognisable value is used for every kind of proxy outcome — allowed read and write, denied write, upstream
/// 500, TLS failure, rejected credential, unreachable cluster, rejected path. Afterwards every response FleetConsole
/// produced (bodies and headers), the audit entries, the database and every captured log line are scanned for the token
/// in plain, base64 and base64url form. A second sweep over real sockets covers a followed log and an exec WebSocket
/// handshake with frames in both directions (CP4a SAFE-3). A third sweep (T-0201, CP4b CFG-4) reads and patches a
/// Secret and checks that its values, plain or base64, reach neither the audit nor the logs. A fourth (T-0325, FBE-6)
/// sweeps the fleet status stream, its probe-failure log lines and every recorded activity.
/// </summary>
/// <remarks>
/// The fake API server never echoes the bearer token here: an upstream body is passed through by design, so echoing
/// would only test the fake. Proof that the token was really used is that the fake saw it as <c>Authorization</c>.
/// </remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProxyTokenLeakSweepTests(ApiFactory factory)
{
    private const string ConfigMap = "/api/v1/namespaces/shop/configmaps/web";
    private const string Failing = "/api/v1/namespaces/shop/configmaps/boom";
    private const string Rejected = "/api/v1/namespaces/shop/secrets";
    private const string Secret = "/api/v1/namespaces/shop/secrets/db";
    private const string Log = "/api/v1/namespaces/shop/pods/web-1/log";
    private const string Exec = "/api/v1/namespaces/shop/pods/web-1/exec";
    private const string FollowQuery = "?follow=true&tailLines=1000&timestamps=true&container=app";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task NoToken_InAnyProxyResponse_AuditEntry_DatabaseRow_OrLogLine()
    {
        var token = $"sec4-sweep-sa-token.{TestData.Unique()}{TestData.Unique()}.not-a-real-signature";
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        await using var other = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var stopped = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var stoppedUrl = stopped.BaseAddress.ToString();
        await stopped.DisposeAsync();

        server.Respond("GET", ConfigMap, 200, new { kind = "ConfigMap", metadata = new { name = "web" } });
        server.Respond("PUT", ConfigMap, 200, new { kind = "ConfigMap", metadata = new { name = "web" } });
        server.Respond("GET", Failing, 500, new { kind = "Status", code = 500, message = "etcd is sad" });
        server.Respond("GET", Rejected, 401, new { kind = "Status", code = 401, message = "Unauthorized" });
        server.MapGet(Log, WriteLogLineAsync);

        var username = factory.NewUsername();
        var (readWrite, _) = await factory.Data.ProxyClusterAsync(server, username, AccessMode.ReadWrite, token);
        var readOnly = await GrantedClusterAsync(username, server.BaseAddress.ToString(), server.CaBundlePem, AccessMode.ReadOnly, token);
        var wrongCa = await GrantedClusterAsync(username, server.BaseAddress.ToString(), other.CaBundlePem, AccessMode.ReadWrite, token);
        var unreachable = await GrantedClusterAsync(username, stoppedUrl, server.CaBundlePem, AccessMode.ReadWrite, token);
        using var client = await ProxyTestClient.LoginAsync(factory, username);

        var haystacks = new List<string>();
        async Task SendAsync(HttpMethod method, string cluster, string path, HttpStatusCode expected)
        {
            using var content = method == HttpMethod.Put ? new StringContent("{\"kind\":\"ConfigMap\"}", Encoding.UTF8, "application/json") : null;
            using var response = await client.SendAsync(method, cluster, path, content);
            response.StatusCode.ShouldBe(expected, $"{method} {cluster} {path}");
            haystacks.Add(string.Join('\n', response.Headers.Concat(response.Content.Headers).Select(h => $"{h.Key}: {string.Join(", ", h.Value)}")));
            haystacks.Add(await response.Content.ReadAsStringAsync(Ct));
        }

        await SendAsync(HttpMethod.Get, readWrite.Name, ConfigMap, HttpStatusCode.OK);                    // allowed GET
        await SendAsync(HttpMethod.Put, readWrite.Name, ConfigMap, HttpStatusCode.OK);                    // allowed PUT
        await SendAsync(HttpMethod.Put, readOnly, ConfigMap, HttpStatusCode.Forbidden);                   // denied PUT
        await SendAsync(HttpMethod.Get, readWrite.Name, Failing, HttpStatusCode.InternalServerError);     // upstream 500
        await SendAsync(HttpMethod.Get, wrongCa, ConfigMap, HttpStatusCode.BadGateway);                   // TLS error
        await SendAsync(HttpMethod.Get, readWrite.Name, Rejected, HttpStatusCode.BadGateway);             // credential rejected
        await SendAsync(HttpMethod.Get, unreachable, ConfigMap, HttpStatusCode.BadGateway);               // unreachable
        await SendAsync(HttpMethod.Get, readWrite.Name, "/api/%2e%2e/secrets", HttpStatusCode.BadRequest); // path rejected
        await SendAsync(HttpMethod.Get, readWrite.Name, Log + FollowQuery, HttpStatusCode.OK);             // followed log

        // The token really travelled: the cluster saw it as the bearer (allowed GET/PUT, 500, 401, log).
        server.Requests.Count(r => r.Authorization == $"Bearer {token}").ShouldBe(5);

        var audit = (await factory.Data.AuditEntriesAsync(username)).Where(e => e.Category == AuditCategory.Proxy).ToList();
        audit.Count.ShouldBe(2, "allowed PUT + denied PUT");
        var database = await TokenLeakScanner.DumpDatabaseAsync(factory.ConnectionString, Ct);
        string[] all = [.. haystacks, .. audit.Select(e => e.DetailsJson), .. audit.Select(e => e.Summary), database, factory.Logs.AllText];

        AssertTokenAbsent(token, all);
    }

    // SAFE-3 over real sockets (exec needs a real upgrade): a followed log and an exec session — handshake, a stdin
    // frame up, its echo down, the close — leave no trace of the token in what the browser got, the audit, the
    // database or the logs (including the session-end line).
    [Fact]
    public async Task NoToken_InFollowedLog_ExecHandshake_Or_ExecFrames()
    {
        var token = $"safe3-sweep-sa-token.{TestData.Unique()}{TestData.Unique()}.not-a-real-signature";
        await using var host = await factory.CreateVariantAsync(new Dictionary<string, string?>(), kestrel: true);
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapGet(Log, WriteLogLineAsync);
        server.Map("GET", Exec, EchoOnceAsync);
        server.Map("CONNECT", Exec, EchoOnceAsync);
        var username = host.NewUsername();
        var (cluster, _) = await host.Data.ProxyClusterAsync(server, username, AccessMode.ReadWrite, token);
        var cookies = new CookieContainer();
        using var client = host.CreateKestrelBrowserClient(cookies);
        using (var login = await host.RunLoginAsync(client, username))
        {
            login.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        }

        var haystacks = new List<string>();
        using (var log = await client.GetAsync($"api/clusters/{cluster.Name}/k8s{Log}{FollowQuery}", Ct))
        {
            log.StatusCode.ShouldBe(HttpStatusCode.OK);
            haystacks.Add(string.Join('\n', log.Headers.Concat(log.Content.Headers).Select(h => $"{h.Key}: {string.Join(", ", h.Value)}")));
            haystacks.Add(await log.Content.ReadAsStringAsync(Ct));
        }

        using (var socket = new ClientWebSocket())
        {
            socket.Options.SetRequestHeader("Origin", TestHostConfiguration.PublicOrigin);
            socket.Options.Cookies = cookies;
            socket.Options.CollectHttpResponseDetails = true;
            var uri = new UriBuilder(host.KestrelAddress!) { Scheme = "ws", Path = $"/api/clusters/{cluster.Name}/k8s{Exec}", Query = "command=sh&container=app&stdin=1&stdout=1&tty=1" }.Uri;
            await socket.ConnectAsync(uri, Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct);
            haystacks.Add(string.Join('\n', socket.HttpResponseHeaders!.Select(h => $"{h.Key}: {string.Join(", ", h.Value)}")));
            await socket.SendAsync("0aGk="u8.ToArray(), WebSocketMessageType.Text, endOfMessage: true, Ct);
            var buffer = new byte[1024];
            var echo = await socket.ReceiveAsync(buffer, Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct);
            haystacks.Add(Encoding.UTF8.GetString(buffer, 0, echo.Count));
            var close = await socket.ReceiveAsync(buffer, Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct);
            haystacks.Add(socket.CloseStatusDescription ?? string.Empty);
            close.MessageType.ShouldBe(WebSocketMessageType.Close);
            await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "bye", Ct);
        }

        await ProxyStreamingAndAuditTests.WaitUntilAsync(() => host.Logs.Entries.Any(e => e.EventId == 2403), "the exec session end was logged");
        server.Requests.Count(r => r.Authorization == $"Bearer {token}").ShouldBe(2, "log + exec");
        var audit = (await host.Data.AuditEntriesAsync(username)).Where(e => e.Category == AuditCategory.Proxy).ToList();
        audit.ShouldHaveSingleItem("the exec handshake; log reads are not audited").Action.ShouldBe("proxy.connect");
        var database = await TokenLeakScanner.DumpDatabaseAsync(host.ConnectionString, Ct);
        string[] all = [.. haystacks, .. audit.Select(e => e.DetailsJson), .. audit.Select(e => e.Summary), database, host.Logs.AllText];

        AssertTokenAbsent(token, all);
    }

    // CFG-4: a Secret GET (values come back base64-encoded under data) and a PATCH carrying new values (plain under
    // stringData, base64 under data) are passed through — the browser needs them — but the values must reach neither
    // the audit entries (summary, details), any database row, nor any captured log line.
    [Fact]
    public async Task NoSecretValue_InAuditEntry_DatabaseRow_OrLogLine_ForSecretGetAndPatch()
    {
        var token = $"cfg4-sweep-sa-token.{TestData.Unique()}.not-a-real-signature";
        var stored = $"cfg4-stored-password-{TestData.Unique()}";
        var patchedPlain = $"cfg4-new-plain-value-{TestData.Unique()}";
        var patchedData = $"cfg4-new-data-value-{TestData.Unique()}";
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", Secret, 200, new { kind = "Secret", metadata = new { name = "db" }, type = "Opaque", data = new { password = Base64(stored) } });
        server.Respond("PATCH", Secret, 200, new { kind = "Secret", metadata = new { name = "db" }, type = "Opaque", data = new { password = Base64(patchedData), extra = Base64(patchedPlain) } });

        var username = factory.NewUsername();
        var (cluster, _) = await factory.Data.ProxyClusterAsync(server, username, AccessMode.ReadWrite, token);
        using var client = await ProxyTestClient.LoginAsync(factory, username);

        using (var get = await client.SendAsync(HttpMethod.Get, cluster.Name, Secret))
        {
            get.StatusCode.ShouldBe(HttpStatusCode.OK);
            (await get.Content.ReadAsStringAsync(Ct)).ShouldContain(Base64(stored), customMessage: "the read is passed through");
        }

        var patch = $"{{\"data\":{{\"password\":\"{Base64(patchedData)}\"}},\"stringData\":{{\"extra\":\"{patchedPlain}\"}}}}";
        using var content = new StringContent(patch, Encoding.UTF8, "application/merge-patch+json");
        content.Headers.ContentType!.CharSet = null;
        using (var response = await client.SendAsync(HttpMethod.Patch, cluster.Name, Secret, content))
        {
            response.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        // The values really travelled: the cluster got the patch body as sent.
        server.Requests.Single(r => r.Method == "PATCH").Body.ShouldBe(patch);

        var audit = (await factory.Data.AuditEntriesAsync(username)).Where(e => e.Category == AuditCategory.Proxy).ToList();
        audit.ShouldHaveSingleItem("the PATCH; reads are not audited").Action.ShouldBe("proxy.patch");
        var database = await TokenLeakScanner.DumpDatabaseAsync(factory.ConnectionString, Ct);
        string[] all = [.. audit.Select(e => e.DetailsJson), .. audit.Select(e => e.Summary), database, factory.Logs.AllText];

        foreach (var value in new[] { stored, patchedPlain, patchedData })
        {
            AssertTokenAbsent(value, all);
        }
    }

    // T-0325 / FBE-6: the fleet status stream. One token for a healthy cluster, a cluster whose 403 and 500 bodies echo
    // the token back (upstream text must never reach a line), a 401 that also echoes it (tokenInvalid), a TLS failure and
    // an unreachable cluster. Response body and headers, every log line (including the probe-failure lines, EventId
    // 5300), every recorded activity and the database must not contain it.
    [Fact]
    public async Task NoToken_InFleetStatusLines_ProbeLogs_Activities_OrDatabase()
    {
        var token = $"fbe6-sweep-sa-token.{TestData.Unique()}{TestData.Unique()}.not-a-real-signature";
        var activities = new List<string>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = _ => true,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = activity =>
            {
                var text = string.Join('\n', [
                    activity.OperationName, activity.DisplayName, activity.StatusDescription ?? string.Empty,
                    .. activity.TagObjects.Select(t => $"{t.Key}={t.Value}"),
                    .. activity.Baggage.Select(b => $"{b.Key}={b.Value}"),
                    .. activity.Events.SelectMany(e => e.Tags.Select(t => $"{e.Name} {t.Key}={t.Value}"))]);
                lock (activities)
                {
                    activities.Add(text);
                }
            },
        };
        ActivitySource.AddActivityListener(listener);

        await using var healthy = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        healthy.MapClusterVersion();
        healthy.MapClusterOperatorsTable(("True", "False", "False"));
        healthy.MapNodesTable("Ready");
        await using var echoing = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        echoing.Respond("GET", FakeKubeApiServer.ClusterVersionPath, 403, new { kind = "Status", code = 403, message = $"forbidden for {token}" });
        echoing.Respond("GET", FakeKubeApiServer.ClusterOperatorsPath, 500, new { kind = "Status", code = 500, message = $"boom {token}" });
        echoing.MapNodesTable("Ready");
        await using var rejecting = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        foreach (var path in new[] { FakeKubeApiServer.ClusterVersionPath, FakeKubeApiServer.ClusterOperatorsPath, FakeKubeApiServer.NodesPath })
        {
            rejecting.Respond("GET", path, 401, new { kind = "Status", code = 401, message = $"token {token} is invalid" });
        }

        var stopped = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var stoppedUrl = stopped.BaseAddress.ToString();
        await stopped.DisposeAsync();

        var username = factory.NewUsername();
        var (ok, _) = await factory.Data.ProxyClusterAsync(healthy, username, AccessMode.ReadOnly, token);
        var (echo, _) = await factory.Data.ProxyClusterAsync(echoing, username, AccessMode.ReadOnly, token);
        var (invalid, _) = await factory.Data.ProxyClusterAsync(rejecting, username, AccessMode.ReadOnly, token);
        var wrongCa = await GrantedClusterAsync(username, healthy.BaseAddress.ToString(), echoing.CaBundlePem, AccessMode.ReadOnly, token);
        var unreachable = await GrantedClusterAsync(username, stoppedUrl, healthy.CaBundlePem, AccessMode.ReadOnly, token);
        using var client = await factory.LoginAsAsync(username);
        var logsBefore = factory.Logs.Entries.Count;

        string body;
        string headers;
        using (var response = await client.GetAsync(new Uri("/api/fleet/status", UriKind.Relative), Ct))
        {
            response.StatusCode.ShouldBe(HttpStatusCode.OK);
            headers = string.Join('\n', response.Headers.Concat(response.Content.Headers).Select(h => $"{h.Key}: {string.Join(", ", h.Value)}"));
            body = await response.Content.ReadAsStringAsync(Ct);
        }

        var failures = body.Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(line => JsonDocument.Parse(line).RootElement)
            .ToDictionary(line => line.GetProperty("cluster").GetProperty("name").GetString()!, line => line.GetProperty("failure").GetString());
        failures.ShouldBe(new Dictionary<string, string?>
        {
            [ok.Name] = null,
            [echo.Name] = "upstreamError",
            [invalid.Name] = "tokenInvalid",
            [wrongCa] = "tlsError",
            [unreachable] = "unreachable",
        }, ignoreOrder: true);

        // The token really travelled, and the failures were logged (so the log scan below covers them).
        (healthy.Requests.Count(r => r.Authorization == $"Bearer {token}") + echoing.Requests.Count(r => r.Authorization == $"Bearer {token}")
            + rejecting.Requests.Count(r => r.Authorization == $"Bearer {token}")).ShouldBe(9);
        factory.Logs.Entries.Skip(logsBefore).Count(e => e.EventId == 5300).ShouldBeGreaterThanOrEqualTo(4);
        string[] recorded;
        lock (activities)
        {
            recorded = [.. activities];
        }

        recorded.ShouldNotBeEmpty();
        var database = await TokenLeakScanner.DumpDatabaseAsync(factory.ConnectionString, Ct);

        AssertTokenAbsent(token, [body, headers, factory.Logs.AllText, database, .. recorded]);
    }

    private static string Base64(string value) => Convert.ToBase64String(Encoding.UTF8.GetBytes(value));

    // The token in plain, base64 and base64url form must be in none of the haystacks.
    private static void AssertTokenAbsent(string token, string[] haystacks)
    {
        var base64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(token));
        foreach (var form in new[] { token, base64, base64.TrimEnd('=').Replace('+', '-').Replace('/', '_') })
        {
            TokenLeakScanner.AssertAbsent(form, haystacks);
        }
    }

    // A followed log that writes one line and ends (as when the container stops), so the whole body can be read.
    private static async Task WriteLogLineAsync(HttpContext context)
    {
        context.Response.ContentType = "text/plain";
        await context.Response.WriteAsync("2026-11-23T09:00:00.000000000Z started\n", context.RequestAborted);
    }

    // The fake exec endpoint: echoes one frame, then closes the session.
    private static async Task EchoOnceAsync(HttpContext context)
    {
        if (!context.WebSockets.IsWebSocketRequest)
        {
            context.Response.StatusCode = 400;
            return;
        }

        using var socket = await context.WebSockets.AcceptWebSocketAsync();
        var buffer = new byte[1024];
        var received = await socket.ReceiveAsync(buffer, context.RequestAborted);
        await socket.SendAsync(buffer.AsMemory(0, received.Count), received.MessageType, endOfMessage: true, context.RequestAborted);
        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "exit", context.RequestAborted);
    }

    // An enabled cluster at apiUrl trusting caBundlePem, with its own credential holding token, granted to username.
    private async Task<string> GrantedClusterAsync(string username, string apiUrl, string caBundlePem, AccessMode mode, string token)
    {
        var cluster = await factory.Data.ClusterAsync(apiUrl: apiUrl, caBundlePem: caBundlePem);
        var credential = await factory.Data.CredentialAsync(cluster.Name, token);
        await factory.Data.GrantAsync(username, cluster.Name, credential.Id, mode);
        return cluster.Name;
    }
}
