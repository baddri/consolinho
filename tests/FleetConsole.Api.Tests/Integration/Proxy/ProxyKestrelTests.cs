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
/// the cluster (exec), on a variant hosted on Kestrel over loopback sockets.
/// </summary>
/// <remarks>The body limit is lowered to 1 KiB so the over-limit body is small.</remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProxyKestrelTests(ProxyKestrelTests.Host fixture) : IClassFixture<ProxyKestrelTests.Host>
{
    private const string ConfigMap = "/api/v1/namespaces/shop/configmaps/web";
    private const string Pods = "/api/v1/namespaces/shop/pods";
    private const string Exec = "/api/v1/namespaces/shop/pods/web-1/exec";
    private const int Limit = 1024;

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

    [Fact]
    public async Task WebSocket_Exec_Is_Forwarded_With_The_SA_Token_And_Audited_As_Connect()
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
            using var socket = await context.WebSockets.AcceptWebSocketAsync();
            var buffer = new byte[1024];
            var received = await socket.ReceiveAsync(buffer, context.RequestAborted);
            await socket.SendAsync(buffer.AsMemory(0, received.Count), WebSocketMessageType.Binary, endOfMessage: true, context.RequestAborted);
            await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", context.RequestAborted);
        };
        server.Map("GET", Exec, echoOnce);
        server.Map("CONNECT", Exec, echoOnce);
        var (client, cluster, username, cookies) = await SignedInAsync(server);
        using var _ = client;

        using var socket = new ClientWebSocket();
        socket.Options.SetRequestHeader("Origin", TestHostConfiguration.PublicOrigin);
        socket.Options.Cookies = cookies;
        var uri = new UriBuilder(_host.KestrelAddress!) { Scheme = "ws", Path = $"/api/clusters/{cluster}/k8s{Exec}", Query = "command=sh&stdin=true" }.Uri;
        await socket.ConnectAsync(uri, Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct);

        await socket.SendAsync("hello"u8.ToArray(), WebSocketMessageType.Binary, endOfMessage: true, Ct);
        var buffer = new byte[1024];
        var echo = await socket.ReceiveAsync(buffer, Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct);
        Encoding.UTF8.GetString(buffer, 0, echo.Count).ShouldBe("hello");

        var forwarded = server.Requests.ShouldHaveSingleItem();
        forwarded.Authorization.ShouldNotBeNull().ShouldStartWith("Bearer fake-test-token.");
        forwarded.Headers.ShouldNotContainKey("Cookie");

        // The cluster ends the session; the entry is written once the forwarded upgrade is over.
        (await socket.ReceiveAsync(buffer, Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct)).MessageType.ShouldBe(WebSocketMessageType.Close);
        await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "bye", Ct);
        var entry = await SingleProxyEntryAsync(_host, username);
        entry.Action.ShouldBe("proxy.connect");
        // The upstream status: 200 for an HTTP/2 extended CONNECT (what the fake negotiates), 101 for an HTTP/1.1 upgrade.
        Details(entry).GetProperty("statusCode").GetInt32().ShouldBe(forwarded.Method == "CONNECT" ? 200 : 101);
        Details(entry).GetProperty("subresource").GetString().ShouldBe("exec");
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
    // forwarded (RFC 9110 §7.6.1), like the fixed hop-by-hop set. Fails today: YARP forwards it.
    [Fact(Skip = "T-0093: headers nominated by the client's Connection header are forwarded upstream")]
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

    // A fresh user with a ReadWrite grant on a cluster at server, signed in over sockets; the cookie jar is returned
    // too, for the WebSocket handshake.
    private async Task<(HttpClient Client, string Cluster, string Username, CookieContainer Cookies)> SignedInAsync(FakeKubeApiServer server)
    {
        var username = _host.NewUsername();
        var (cluster, _) = await _host.Data.ProxyClusterAsync(server, username, AccessMode.ReadWrite);
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
