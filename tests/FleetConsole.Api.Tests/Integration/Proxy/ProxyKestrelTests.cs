using System.Net;
using System.Net.WebSockets;
using System.Text;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Application.Proxy;
using FleetConsole.Domain.Access;
using Microsoft.AspNetCore.Http;
using static FleetConsole.Api.Tests.Integration.Proxy.ProxyStreamingAndAuditTests;

namespace FleetConsole.Api.Tests.Integration.Proxy;

/// <summary>
/// Proxy behaviour that only a real server shows (T-0061 review): the 413 for a <b>chunked</b> body over the limit (the
/// size feature Kestrel enforces while streaming) with its Denied audit entry, and a real WebSocket upgrade forwarded to
/// the cluster (exec) — audited at the handshake with its container, refusals audited once, session ends logged
/// (ADR-0036 §3–5; TERM-4, TERM-6, TERM-7) — on a variant hosted on Kestrel over loopback sockets.
/// </summary>
/// <remarks>The body limit is lowered to 1 KiB so the over-limit body is small.</remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProxyKestrelTests(ProxyKestrelTests.Host fixture) : IClassFixture<ProxyKestrelTests.Host>
{
    private const string ConfigMap = "/api/v1/namespaces/shop/configmaps/web";
    private const string Pods = "/api/v1/namespaces/shop/pods";
    private const string Exec = "/api/v1/namespaces/shop/pods/web-1/exec";
    private const int Limit = 1024;
    private const string ChannelProtocol = "base64.channel.k8s.io";

    // The SPA's terminal query (FE contract), with a fake secret in the command that must never be recorded or logged.
    private const string ExecQuery = "?command=sh&command=-c&command=echo%20fake-secret&container=app&stdin=1&stdout=1&stderr=1&tty=1";

    private readonly ApiFactory _host = fixture.Api;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Chunked_Body_Over_The_Limit_Is_413_BodyTooLarge_And_Audited_As_Denied()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("PUT", ConfigMap, 200, new { kind = "ConfigMap" });
        var (client, cluster, username, _) = await SignedInAsync(server);
        using var __ = client;

        using var request = new HttpRequestMessage(HttpMethod.Put, $"api/clusters/{cluster}/k8s{ConfigMap}")
        {
            Content = new StreamContent(new MemoryStream(Encoding.UTF8.GetBytes("{\"data\":\"" + new string('x', Limit * 2) + "\"}"))),
        };
        request.Content.Headers.ContentType = new("application/json");
        request.Headers.TransferEncodingChunked = true; // no Content-Length: only the streaming limit can catch it
        using var response = await client.SendAsync(request, Ct);

        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(response, HttpStatusCode.RequestEntityTooLarge, ProxyErrors.BodyTooLarge(Limit));
        var entry = await SingleProxyEntryAsync(_host, username);
        entry.Action.ShouldBe("proxy.update");
        Details(entry).GetProperty("statusCode").GetInt32().ShouldBe(413);
        Details(entry).GetProperty("outcome").GetString().ShouldBe("denied");
        Details(entry).GetProperty("reason").GetString().ShouldBe("bodyTooLarge");
        server.Requests.ShouldNotContain(r => r.Method == "PUT" && r.Body.Length > Limit, "the over-limit body never reached the cluster whole");
    }

    // TERM-6, TERM-7 (ADR-0036 §3, §5): the entry exists once the socket is open, before any frame, names the container
    // and never the command; the base64 channel subprotocol is negotiated as sent and a frame is echoed promptly.
    [Fact]
    public async Task WebSocket_Exec_Is_Forwarded_With_The_SA_Token_And_Audited_As_Connect_At_The_Handshake()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        // An HTTP/1.1 client upgrade may reach the cluster as an HTTP/2 extended CONNECT (RFC 8441) when the cluster
        // offers it, or as an HTTP/1.1 GET upgrade otherwise: the fake answers both.
        RequestDelegate echoOnce = async context =>
        {
            if (!context.WebSockets.IsWebSocketRequest)
            {
                context.Response.StatusCode = 400;
                return;
            }

            // Echo one message back, then close: enough to prove both directions of the upgraded stream.
            using var socket = await context.WebSockets.AcceptWebSocketAsync(context.WebSockets.WebSocketRequestedProtocols.FirstOrDefault());
            var buffer = new byte[1024];
            var received = await socket.ReceiveAsync(buffer, context.RequestAborted);
            await socket.SendAsync(buffer.AsMemory(0, received.Count), WebSocketMessageType.Binary, endOfMessage: true, context.RequestAborted);
            await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", context.RequestAborted);
        };
        server.Map("GET", Exec, echoOnce);
        server.Map("CONNECT", Exec, echoOnce);
        var (client, cluster, username, cookies) = await SignedInAsync(server);
        using var _ = client;

        using var socket = NewSocket(cookies);
        socket.Options.AddSubProtocol(ChannelProtocol);
        await socket.ConnectAsync(ExecUri(cluster, ExecQuery), Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct);
        socket.SubProtocol.ShouldBe(ChannelProtocol);

        // TERM-7: read once, no waiting: the entry was written before the proxy completed the client's handshake.
        var opened = (await ProxyEntriesAsync(username)).ShouldHaveSingleItem();
        opened.Action.ShouldBe("proxy.connect");
        Details(opened).GetProperty("outcome").GetString().ShouldBe("allowed");
        Details(opened).GetProperty("subresource").GetString().ShouldBe("exec");
        Details(opened).GetProperty("container").GetString().ShouldBe("app");
        opened.DetailsJson.ShouldNotContain("fake-secret");
        opened.Summary.ShouldNotContain("fake-secret");

        // TERM-6: a stdin frame (channel 0, base64 "aGk=" = "hi") comes back on the echo within 500 ms.
        var clock = System.Diagnostics.Stopwatch.StartNew();
        await socket.SendAsync("0aGk="u8.ToArray(), WebSocketMessageType.Text, endOfMessage: true, Ct);
        var buffer = new byte[1024];
        var echo = await socket.ReceiveAsync(buffer, Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct);
        clock.Elapsed.ShouldBeLessThan(TimeSpan.FromMilliseconds(500));
        Encoding.UTF8.GetString(buffer, 0, echo.Count).ShouldBe("0aGk=");

        var forwarded = server.Requests.ShouldHaveSingleItem();
        forwarded.Authorization.ShouldNotBeNull().ShouldStartWith("Bearer fake-test-token.");
        forwarded.Headers.ShouldNotContainKey("Cookie");
        // The upstream status as is: 101 for an HTTP/1.1 upgrade, 200 while the fake negotiates an HTTP/2 extended
        // CONNECT (T-0091 pins upgrades to HTTP/1.1).
        Details(opened).GetProperty("statusCode").GetInt32().ShouldBe(forwarded.Method == "CONNECT" ? 200 : 101);

        // The cluster ends the session: still exactly one entry, and the end is a log line (cause upstream or client,
        // depending on which side's close YARP sees first), without the command.
        (await socket.ReceiveAsync(buffer, Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct)).MessageType.ShouldBe(WebSocketMessageType.Close);
        await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "bye", Ct);
        await WaitUntilAsync(() => SessionEndedLogs(cluster).Count > 0, "the session end was logged");
        (await ProxyEntriesAsync(username)).ShouldHaveSingleItem();
    }

    // ADR-0036 §4: a client that drops the socket ends the session with cause "client"; the line has no query or token.
    [Fact]
    public async Task Exec_Session_Dropped_By_The_Client_Is_Logged_With_Cause_Client()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Map("GET", Exec, EchoUntilClosed);
        server.Map("CONNECT", Exec, EchoUntilClosed);
        var (client, cluster, username, cookies) = await SignedInAsync(server);
        using var _ = client;

        var socket = NewSocket(cookies);
        await socket.ConnectAsync(ExecUri(cluster, ExecQuery), Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct);
        socket.Abort();
        socket.Dispose();

        await WaitUntilAsync(() => SessionEndedLogs(cluster).Count > 0, "the session end was logged");
        var line = SessionEndedLogs(cluster).ShouldHaveSingleItem();
        line.ShouldContain("shop/web-1 container app");
        line.ShouldContain("Cause=Client");
        line.ShouldNotContain("command");
        line.ShouldNotContain("fake-secret");
        line.ShouldNotContain("fake-test-token");
        (await ProxyEntriesAsync(username)).ShouldHaveSingleItem();
    }

    // ADR-0036 §4 (T-0156 review): the cluster ending the session cleanly (the shell exited, full close handshake with
    // the browser) is cause "upstream", not "client".
    [Fact]
    public async Task Exec_Session_Ended_By_The_Cluster_Is_Logged_With_Cause_Upstream()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        RequestDelegate exitAtOnce = async context =>
        {
            if (!context.WebSockets.IsWebSocketRequest)
            {
                context.Response.StatusCode = 400;
                return;
            }

            // Like a shell that exits: one frame, then the close handshake, then the cluster drops the connection.
            using var socket = await context.WebSockets.AcceptWebSocketAsync();
            await socket.SendAsync("1bye"u8.ToArray(), WebSocketMessageType.Text, endOfMessage: true, context.RequestAborted);
            await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "exit", context.RequestAborted);
        };
        server.Map("GET", Exec, exitAtOnce);
        server.Map("CONNECT", Exec, exitAtOnce);
        var (client, cluster, username, cookies) = await SignedInAsync(server);
        using var _ = client;

        using var socket = NewSocket(cookies);
        await socket.ConnectAsync(ExecUri(cluster, ExecQuery), Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct);
        var buffer = new byte[1024];
        (await socket.ReceiveAsync(buffer, Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct)).MessageType.ShouldBe(WebSocketMessageType.Text);
        (await socket.ReceiveAsync(buffer, Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct)).MessageType.ShouldBe(WebSocketMessageType.Close);
        await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "bye", Ct);

        await WaitUntilAsync(() => SessionEndedLogs(cluster).Count > 0, "the session end was logged");
        SessionEndedLogs(cluster).ShouldHaveSingleItem().ShouldContain("Cause=Upstream");
        (await ProxyEntriesAsync(username)).ShouldHaveSingleItem();
    }

    // T-0156 review: only Connect verbs (exec/attach) are sessions. A WebSocket watch is an upgrade too, but it is a
    // read: no audit entry and no "Exec session ended" line.
    [Fact]
    public async Task WebSocket_Watch_Is_Neither_Audited_Nor_Logged_As_An_Exec_Session()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        RequestDelegate oneEvent = async context =>
        {
            if (!context.WebSockets.IsWebSocketRequest)
            {
                context.Response.StatusCode = 400;
                return;
            }

            using var socket = await context.WebSockets.AcceptWebSocketAsync();
            await socket.SendAsync("{\"type\":\"ADDED\"}"u8.ToArray(), WebSocketMessageType.Text, endOfMessage: true, context.RequestAborted);
            await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", context.RequestAborted);
        };
        server.Map("GET", Pods, oneEvent);
        server.Map("CONNECT", Pods, oneEvent);
        var (client, cluster, username, cookies) = await SignedInAsync(server);
        using var _ = client;

        using var socket = NewSocket(cookies);
        var uri = new UriBuilder(_host.KestrelAddress!) { Scheme = "ws", Path = $"/api/clusters/{cluster}/k8s{Pods}", Query = "watch=1" }.Uri;
        await socket.ConnectAsync(uri, Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct);
        var buffer = new byte[1024];
        (await socket.ReceiveAsync(buffer, Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct)).MessageType.ShouldBe(WebSocketMessageType.Text);
        (await socket.ReceiveAsync(buffer, Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct)).MessageType.ShouldBe(WebSocketMessageType.Close);
        await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "bye", Ct);

        server.Requests.ShouldHaveSingleItem().Authorization.ShouldNotBeNull().ShouldStartWith("Bearer fake-test-token.");
        await Task.Delay(TimeSpan.FromMilliseconds(500), Ct); // a session-end line or an entry would have been written by now
        SessionEndedLogs(cluster).ShouldBeEmpty();
        (await ProxyEntriesAsync(username)).ShouldBeEmpty();
    }

    // TERM-6: the Origin check answers before authorization with a problem, and nothing reaches the cluster.
    [Fact]
    public async Task Exec_Upgrade_From_A_Foreign_Origin_Is_403_OriginNotAllowed_Without_Upstream_Request()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var (client, cluster, _, _) = await SignedInAsync(server);
        using var _ = client;

        using var request = new HttpRequestMessage(HttpMethod.Get, $"api/clusters/{cluster}/k8s{Exec}{ExecQuery}");
        request.Headers.TryAddWithoutValidation("Connection", "Upgrade");
        request.Headers.TryAddWithoutValidation("Upgrade", "websocket");
        request.Headers.TryAddWithoutValidation("Sec-WebSocket-Version", "13");
        request.Headers.TryAddWithoutValidation("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==");
        request.Headers.TryAddWithoutValidation("Origin", "https://evil.example");
        using var response = await client.SendAsync(request, Ct);

        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(response, HttpStatusCode.Forbidden, ProxyErrors.OriginNotAllowed);
        server.Requests.ShouldBeEmpty();
    }

    // TERM-4: read-only users and grants never reach the cluster; the denial is audited with the container.
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Exec_Upgrade_Of_A_Read_Only_Principal_Is_403_And_Audited_As_Denied(bool readOnlyUser)
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var (client, cluster, username, cookies) = await SignedInAsync(
            server, readOnlyUser ? AccessMode.ReadWrite : AccessMode.ReadOnly, readOnlyUser);
        using var _ = client;

        using var socket = NewSocket(cookies);
        socket.Options.CollectHttpResponseDetails = true;
        await Should.ThrowAsync<WebSocketException>(() => socket.ConnectAsync(ExecUri(cluster, ExecQuery), Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct));

        socket.HttpStatusCode.ShouldBe(HttpStatusCode.Forbidden);
        server.Requests.ShouldBeEmpty();
        var entry = await SingleProxyEntryAsync(_host, username);
        entry.Action.ShouldBe("proxy.connect");
        Details(entry).GetProperty("outcome").GetString().ShouldBe("denied");
        Details(entry).GetProperty("reason").GetString().ShouldBe(readOnlyUser ? "userReadOnly" : "readOnlyGrant");
        Details(entry).GetProperty("container").GetString().ShouldBe("app");
    }

    // ADR-0036 §3: a refused upgrade (cluster RBAC) is not a handshake; it is audited once, after SendAsync, as 403.
    [Fact]
    public async Task Exec_Refused_By_Cluster_Rbac_Is_Audited_Once_With_403()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var forbidden = new { kind = "Status", apiVersion = "v1", status = "Failure", reason = "Forbidden", code = 403 };
        server.Respond("GET", Exec, 403, forbidden);
        server.Respond("CONNECT", Exec, 403, forbidden);
        var (client, cluster, username, cookies) = await SignedInAsync(server);
        using var _ = client;

        using var socket = NewSocket(cookies);
        socket.Options.CollectHttpResponseDetails = true;
        await Should.ThrowAsync<WebSocketException>(() => socket.ConnectAsync(ExecUri(cluster, ExecQuery), Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct));

        socket.HttpStatusCode.ShouldBe(HttpStatusCode.Forbidden);
        var entry = await SingleProxyEntryAsync(_host, username);
        Details(entry).GetProperty("statusCode").GetInt32().ShouldBe(403);
        Details(entry).GetProperty("outcome").GetString().ShouldBe("allowed");
        await Task.Delay(TimeSpan.FromMilliseconds(200), Ct); // a second (handshake) entry would have been written by now
        (await ProxyEntriesAsync(username)).ShouldHaveSingleItem();
        SessionEndedLogs(cluster).ShouldBeEmpty();
    }

    [Fact]
    public async Task Watch_Events_Reach_The_Client_Within_A_Second_Over_Sockets()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var watch = server.MapWatch(Pods);
        var (client, cluster, _, _) = await SignedInAsync(server);
        using var _ = client;

        var sending = client.GetAsync($"api/clusters/{cluster}/k8s{Pods}?watch=1&timeoutSeconds=60", HttpCompletionOption.ResponseHeadersRead, Ct);
        await AssertEventsStreamAsync(sending, watch);
    }

    [Fact]
    public async Task Watch_Response_Headers_Arrive_Before_The_First_Event()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var watch = server.MapWatch(Pods);
        var (client, cluster, _, _) = await SignedInAsync(server);
        using var _ = client;

        // The fake flushes 200 + headers as soon as the watch is attached, like kube-apiserver; no event follows.
        var sending = client.GetAsync($"api/clusters/{cluster}/k8s{Pods}?watch=1&timeoutSeconds=60", HttpCompletionOption.ResponseHeadersRead, Ct);
        await watch.Connected.WaitAsync(TimeSpan.FromSeconds(10), Ct);
        using var response = await sending.WaitAsync(TimeSpan.FromSeconds(5), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    // QA (CP2 verify), SEC-1 over real sockets: a header the client nominates as hop-by-hop in Connection must not be
    // forwarded (RFC 9110 §7.6.1), like the fixed hop-by-hop set (T-0093).
    [Fact]
    public async Task Connection_Nominated_Header_Is_Not_Forwarded_Over_Sockets()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", Pods, 200, new { kind = "PodList" });
        var (client, cluster, _, _) = await SignedInAsync(server);
        using var _ = client;
        using var request = new HttpRequestMessage(HttpMethod.Get, $"api/clusters/{cluster}/k8s{Pods}");
        request.Headers.TryAddWithoutValidation("Connection", "X-Qa-Hop");
        request.Headers.TryAddWithoutValidation("X-Qa-Hop", "sec1-hop");
        request.Headers.TryAddWithoutValidation("Keep-Alive", "timeout=5");

        using var response = await client.SendAsync(request, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var seen = server.Requests.ShouldHaveSingleItem();
        seen.Headers.ContainsKey("Keep-Alive").ShouldBeFalse("Keep-Alive");
        seen.Headers.ContainsKey("X-Qa-Hop").ShouldBeFalse("X-Qa-Hop");
    }

    // The fake exec endpoint for sessions the client ends: echoes until the proxy goes away.
    private static async Task EchoUntilClosed(HttpContext context)
    {
        if (!context.WebSockets.IsWebSocketRequest)
        {
            context.Response.StatusCode = 400;
            return;
        }

        using var socket = await context.WebSockets.AcceptWebSocketAsync();
        var buffer = new byte[1024];
        try
        {
            while (!(await socket.ReceiveAsync(buffer, context.RequestAborted)).MessageType.Equals(WebSocketMessageType.Close))
            {
            }
        }
        catch (Exception exception) when (exception is WebSocketException or OperationCanceledException)
        {
            // The proxy dropped the tunnel.
        }
    }

    private static ClientWebSocket NewSocket(CookieContainer cookies)
    {
        var socket = new ClientWebSocket();
        socket.Options.SetRequestHeader("Origin", TestHostConfiguration.PublicOrigin);
        socket.Options.Cookies = cookies;
        return socket;
    }

    private Uri ExecUri(string cluster, string query) =>
        new UriBuilder(_host.KestrelAddress!) { Scheme = "ws", Path = $"/api/clusters/{cluster}/k8s{Exec}", Query = query }.Uri;

    private async Task<List<FleetConsole.Domain.Audit.AuditEntry>> ProxyEntriesAsync(string username) =>
        [.. (await _host.Data.AuditEntriesAsync(username)).Where(e => e.Category == FleetConsole.Domain.Audit.AuditCategory.Proxy)];

    // ProxyLog.ExecSessionEnded (EventId 2403) lines of one cluster.
    private List<string> SessionEndedLogs(string cluster) =>
        [.. _host.Logs.Entries.Where(e => e.EventId == 2403 && e.Text.Contains($" on {cluster} ", StringComparison.Ordinal)).Select(e => e.Text)];

    // A fresh user with a grant on a cluster at server, signed in over sockets; the cookie jar is returned too, for
    // the WebSocket handshake.
    private async Task<(HttpClient Client, string Cluster, string Username, CookieContainer Cookies)> SignedInAsync(
        FakeKubeApiServer server, AccessMode mode = AccessMode.ReadWrite, bool readOnlyUser = false)
    {
        var username = _host.NewUsername();
        if (readOnlyUser)
        {
            await _host.Data.UserAsync(username, isReadOnly: true);
        }

        var (cluster, _) = await _host.Data.ProxyClusterAsync(server, username, mode);
        var cookies = new CookieContainer();
        var client = _host.CreateKestrelBrowserClient(cookies);
        using var login = await _host.RunLoginAsync(client, username);
        login.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        return (client, cluster.Name, username, cookies);
    }

    /// <summary>The Kestrel variant shared by the class (body limit 1 KiB).</summary>
    /// <param name="factory">The collection's default host, which creates the variant.</param>
    public sealed class Host(ApiFactory factory) : IAsyncLifetime
    {
        /// <summary>The variant.</summary>
        public ApiFactory Api { get; private set; } = null!;

        /// <inheritdoc />
        public async ValueTask InitializeAsync() =>
            Api = await factory.CreateVariantAsync(
                new Dictionary<string, string?> { ["Proxy:MaxMutationBodyBytes"] = Limit.ToString(System.Globalization.CultureInfo.InvariantCulture) },
                kestrel: true);

        /// <inheritdoc />
        public async ValueTask DisposeAsync() => await Api.DisposeAsync();
    }
}
