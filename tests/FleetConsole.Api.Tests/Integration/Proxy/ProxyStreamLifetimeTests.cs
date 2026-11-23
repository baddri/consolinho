using System.Diagnostics;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Api.Tests.Integration.Admin.Grants;
using FleetConsole.Application.Proxy;
using FleetConsole.Domain.Access;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Api.Tests.Integration.Proxy;

/// <summary>
/// ADR-0036 §1 over real sockets: every proxied stream has a hard lifetime. An exec WebSocket is closed at
/// <c>Proxy:ExecSessionCap</c> but is not cut for idling (TERM-8); a followed log survives quiet periods longer than
/// <c>RequestTimeout</c> (LOG-7) and is cut at the stream lifetime without a Warning (LOG-6). After revocation, the
/// reconnect is re-authorized and gets 404.
/// </summary>
/// <remarks>
/// One Kestrel variant: <c>RequestTimeout=1s</c>, <c>WatchTimeoutCap=1s</c> + <c>StreamIdleSlack=4s</c> (stream
/// lifetime 5 s, longer than the log's 3 s quiet spell) and <c>ExecSessionCap=10s</c>, so the exec session can idle
/// past <c>StreamIdleTimeout</c> and still be open: upgrades idle on the exec cap.
/// </remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProxyStreamLifetimeTests(ProxyStreamLifetimeTests.Host fixture) : IClassFixture<ProxyStreamLifetimeTests.Host>
{
    private const string Exec = "/api/v1/namespaces/shop/pods/web-1/exec";
    private const string Log = "/api/v1/namespaces/shop/pods/web-1/log";
    private static readonly TimeSpan ExecCap = TimeSpan.FromSeconds(10);
    private static readonly ProxyOptions Settings = new()
    {
        WatchTimeoutCap = TimeSpan.FromSeconds(1),
        StreamIdleSlack = TimeSpan.FromSeconds(4),
        ExecSessionCap = ExecCap,
    };

    private readonly ApiFactory _host = fixture.Api;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Idle_Exec_Session_Stays_Open_Is_Closed_At_The_Cap_And_The_Reconnect_After_Revocation_Is_404()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Map("GET", Exec, EchoUntilClosed);
        server.Map("CONNECT", Exec, EchoUntilClosed);
        var (client, cluster, username, cookies) = await SignedInAsync(server);
        using var _ = client;

        using var socket = NewSocket(cookies);
        await socket.ConnectAsync(ExecUri(cluster), Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct);
        var clock = Stopwatch.StartNew(); // the lifetime started just before the handshake, so this bounds it from above

        // Idle past StreamIdleTimeout (5 s): an upgrade's idle timeout is the exec cap, so the session is still open.
        await Task.Delay(Settings.StreamIdleTimeout + TimeSpan.FromSeconds(1), Ct);
        await socket.SendAsync("ping"u8.ToArray(), WebSocketMessageType.Binary, endOfMessage: true, Ct);
        var buffer = new byte[1024];
        var echo = await socket.ReceiveAsync(buffer, Ct).WaitAsync(TimeSpan.FromSeconds(5), Ct);
        Encoding.UTF8.GetString(buffer, 0, echo.Count).ShouldBe("ping");

        // At the cap the proxy drops the tunnel: no close frame, the read fails (the browser sees code 1006).
        await Should.ThrowAsync<WebSocketException>(async () => await socket.ReceiveAsync(buffer, Ct).WaitAsync(TimeSpan.FromSeconds(10), Ct));
        clock.Elapsed.ShouldBeLessThan(ExecCap + TimeSpan.FromSeconds(1));
        clock.Elapsed.ShouldBeGreaterThanOrEqualTo(ExecCap - TimeSpan.FromSeconds(1), "not before the cap (minus the handshake)");

        await RevokeAsync(username, cluster);
        using var reconnect = NewSocket(cookies);
        reconnect.Options.CollectHttpResponseDetails = true;
        await Should.ThrowAsync<WebSocketException>(() => reconnect.ConnectAsync(ExecUri(cluster), Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct));
        reconnect.HttpStatusCode.ShouldBe(HttpStatusCode.NotFound);
        _host.Logs.Entries.ShouldContain(e => e.EventId == 2402 && e.Text.Contains(Exec, StringComparison.Ordinal));
        // ADR-0036 §4: the session end is logged with cause "cap", without the query.
        var ended = _host.Logs.Entries.Where(e => e.EventId == 2403 && e.Text.Contains($" on {cluster} ", StringComparison.Ordinal)).ShouldHaveSingleItem();
        ended.Text.ShouldContain("Cause=Cap");
        ended.Text.ShouldNotContain("command");
        ProxyWarnings().ShouldBeEmpty();
    }

    [Fact]
    public async Task Followed_Log_Survives_Quiet_Periods_Is_Cut_At_The_Lifetime_And_The_Rerequest_After_Revocation_Is_404()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapGet(Log, async context =>
        {
            // Like the kubelet: headers at once, a line, a quiet spell longer than RequestTimeout, a line, then silence.
            context.Response.ContentType = "text/plain";
            await context.Response.WriteAsync("line 1\n", context.RequestAborted);
            await context.Response.Body.FlushAsync(context.RequestAborted);
            await Task.Delay(TimeSpan.FromSeconds(3), context.RequestAborted);
            await context.Response.WriteAsync("line 2\n", context.RequestAborted);
            await context.Response.Body.FlushAsync(context.RequestAborted);
            await Task.Delay(Timeout.Infinite, context.RequestAborted).ContinueWith(_ => { }, TaskScheduler.Default);
        });
        var (client, cluster, username, _) = await SignedInAsync(server);
        using var __ = client;
        var lifetime = Settings.StreamLifetime(isUpgrade: false);

        var clock = Stopwatch.StartNew();
        using var response = await client.GetAsync($"api/clusters/{cluster}/k8s{Log}?follow=true&container=web",
            HttpCompletionOption.ResponseHeadersRead, Ct).WaitAsync(TimeSpan.FromSeconds(10), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        await using var body = await response.Content.ReadAsStreamAsync(Ct);
        using var reader = new StreamReader(body);
        (await reader.ReadLineAsync(Ct).AsTask().WaitAsync(TimeSpan.FromSeconds(5), Ct)).ShouldBe("line 1");
        (await reader.ReadLineAsync(Ct).AsTask().WaitAsync(TimeSpan.FromSeconds(10), Ct)).ShouldBe("line 2", "a quiet log is not cut by RequestTimeout");

        // The proxy aborts the body at the lifetime; the reader fails (or, at worst, sees EOF) — the SPA treats both alike.
        try
        {
            (await reader.ReadLineAsync(Ct).AsTask().WaitAsync(lifetime + TimeSpan.FromSeconds(10), Ct)).ShouldBeNull();
        }
        catch (Exception exception) when (exception is IOException or HttpRequestException)
        {
            // Expected: aborted body.
        }

        clock.Elapsed.ShouldBeLessThan(lifetime + TimeSpan.FromSeconds(1));
        clock.Elapsed.ShouldBeGreaterThanOrEqualTo(lifetime - TimeSpan.FromMilliseconds(200));

        await RevokeAsync(username, cluster);
        using var again = await client.GetAsync($"api/clusters/{cluster}/k8s{Log}?follow=true", HttpCompletionOption.ResponseHeadersRead, Ct);
        await KubernetesProxyForwardingTests.ShouldBeProblemAsync(again, HttpStatusCode.NotFound, ProxyErrors.NotAvailable(cluster));
        _host.Logs.Entries.ShouldContain(e => e.EventId == 2402 && e.Text.Contains(Log, StringComparison.Ordinal));
        ProxyWarnings().ShouldBeEmpty();
    }

    // The fake exec endpoint: echoes every message until the client (here: the proxy) goes away.
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
            while (true)
            {
                var received = await socket.ReceiveAsync(buffer, context.RequestAborted);
                if (received.MessageType == WebSocketMessageType.Close)
                {
                    return;
                }

                await socket.SendAsync(buffer.AsMemory(0, received.Count), received.MessageType, received.EndOfMessage, context.RequestAborted);
            }
        }
        catch (Exception exception) when (exception is WebSocketException or OperationCanceledException)
        {
            // The proxy dropped the tunnel at the cap.
        }
    }

    // Proxy log entries at Warning or above (ForwardFailed etc.): a reached lifetime must produce none.
    private List<(LogLevel Level, int EventId, string Text)> ProxyWarnings() =>
        [.. _host.Logs.Entries.Where(e => e.Level >= LogLevel.Warning && e.EventId is >= 2400 and < 2500)];

    private static ClientWebSocket NewSocket(CookieContainer cookies)
    {
        var socket = new ClientWebSocket();
        socket.Options.SetRequestHeader("Origin", TestHostConfiguration.PublicOrigin);
        socket.Options.Cookies = cookies;
        return socket;
    }

    private Uri ExecUri(string cluster) =>
        new UriBuilder(_host.KestrelAddress!) { Scheme = "ws", Path = $"/api/clusters/{cluster}/k8s{Exec}", Query = "command=sh&stdin=true" }.Uri;

    private async Task RevokeAsync(string username, string cluster)
    {
        // A Kestrel variant has no in-memory client, so the admin signs in over sockets too.
        using var admin = _host.CreateKestrelBrowserClient();
        using (var login = await _host.RunLoginAsync(admin, _host.NewAdminUsername()))
        {
            login.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        }

        var grant = (await GrantsApi.UserGrantsAsync(admin, username)).Single(g => g.GetProperty("clusterName").GetString() == cluster);
        using var revoke = await GrantsApi.RevokeAsync(admin, grant.GetProperty("id").GetGuid());
        revoke.IsSuccessStatusCode.ShouldBeTrue();
    }

    // A fresh user with a ReadWrite grant (exec is a Connect mutation) on a cluster at server, signed in over sockets.
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

    /// <summary>The Kestrel variant shared by the class (short request timeout, watch cap, slack and exec cap).</summary>
    /// <param name="factory">The collection's default host, which creates the variant.</param>
    public sealed class Host(ApiFactory factory) : IAsyncLifetime
    {
        /// <summary>The variant.</summary>
        public ApiFactory Api { get; private set; } = null!;

        /// <inheritdoc />
        public async ValueTask InitializeAsync() =>
            Api = await factory.CreateVariantAsync(
                new Dictionary<string, string?>
                {
                    ["Proxy:RequestTimeout"] = "00:00:01",
                    ["Proxy:WatchTimeoutCap"] = "00:00:01",
                    ["Proxy:StreamIdleSlack"] = "00:00:04",
                    ["Proxy:ExecSessionCap"] = "00:00:10",
                },
                kestrel: true);

        /// <inheritdoc />
        public async ValueTask DisposeAsync() => await Api.DisposeAsync();
    }
}
