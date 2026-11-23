using System.Diagnostics;
using System.Net;
using System.Text;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;
using Microsoft.AspNetCore.Http;

namespace FleetConsole.Api.Tests.Integration.Proxy;

/// <summary>
/// CP4a Pod logs through the proxy over real sockets (T-0157, ADR-0036 §6): a 50 MiB log is streamed, not buffered
/// (LOG-7); a followed line reaches the browser promptly, the log query is forwarded byte-for-byte and log reads are
/// never audited (LOG-3, LOG-9).
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProxyLogStreamTests(ProxyLogStreamTests.Host fixture) : IClassFixture<ProxyLogStreamTests.Host>
{
    private const string Log = "/api/v1/namespaces/shop/pods/web-1/log";
    private const int Chunk = 64 * 1024;
    private const long LogBytes = 50L * 1024 * 1024;
    private const long MemoryBound = 16L * 1024 * 1024;

    private readonly ApiFactory _host = fixture.Api;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // LOG-7: the first chunk reaches the client while the fake is still holding the rest back (it waits for the client
    // to see it), and the process doesn't retain the body: the managed-heap delta stays under 16 MiB mid-stream and at
    // the end. A buffering proxy would deadlock on the first assertion or hold 50 MiB on the second.
    [Fact]
    public async Task A_50_MiB_Log_Streams_Through_The_Proxy_Without_Being_Buffered()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var firstBytesSeen = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var upstreamFinished = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var chunk = LogChunk();
        server.MapGet(Log, async context =>
        {
            context.Response.ContentType = "text/plain";
            await context.Response.Body.WriteAsync(chunk, context.RequestAborted);
            await context.Response.Body.FlushAsync(context.RequestAborted);
            await firstBytesSeen.Task.WaitAsync(TimeSpan.FromSeconds(15), context.RequestAborted);
            for (var written = (long)Chunk; written < LogBytes; written += Chunk)
            {
                await context.Response.Body.WriteAsync(chunk, context.RequestAborted);
            }

            upstreamFinished.SetResult();
        });
        var (client, cluster, _) = await SignedInAsync(server);
        using var _ = client;

        var before = GC.GetTotalMemory(forceFullCollection: true);
        using var response = await client.GetAsync($"api/clusters/{cluster}/k8s{Log}?container=app",
            HttpCompletionOption.ResponseHeadersRead, Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        await using var body = await response.Content.ReadAsStreamAsync(Ct);

        var buffer = new byte[Chunk];
        var total = (long)await body.ReadAsync(buffer, Ct).AsTask().WaitAsync(TimeSpan.FromSeconds(15), Ct);
        total.ShouldBeGreaterThan(0);
        upstreamFinished.Task.IsCompleted.ShouldBeFalse("the first bytes arrived before the upstream finished writing");
        firstBytesSeen.SetResult();

        long midStream = 0;
        int read;
        while ((read = await body.ReadAsync(buffer, Ct)) > 0)
        {
            total += read;
            if (midStream == 0 && total >= LogBytes / 2)
            {
                midStream = GC.GetTotalMemory(forceFullCollection: true) - before;
            }
        }

        var atEnd = GC.GetTotalMemory(forceFullCollection: true) - before;
        total.ShouldBe(LogBytes);
        await upstreamFinished.Task.WaitAsync(TimeSpan.FromSeconds(5), Ct);
        midStream.ShouldBeLessThan(MemoryBound, "heap delta half-way through the body");
        atEnd.ShouldBeLessThan(MemoryBound, "heap delta after the whole body");
    }

    // LOG-3, LOG-9: the SPA's follow query (with sinceTime for a resume and previous for a restarted container) reaches
    // the cluster unchanged, a line the kubelet writes later reaches the client in < 2 s, and no audit entry is written.
    [Fact]
    public async Task Followed_Log_Line_Arrives_Promptly_The_Query_Is_Forwarded_As_Is_And_Nothing_Is_Audited()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var writeLine = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        server.MapGet(Log, async context =>
        {
            context.Response.ContentType = "text/plain";
            await context.Response.Body.FlushAsync(context.RequestAborted);
            await writeLine.Task.WaitAsync(context.RequestAborted);
            await context.Response.WriteAsync("2026-11-23T09:00:01.000000001Z hello\n", context.RequestAborted);
            await context.Response.Body.FlushAsync(context.RequestAborted);
            await Task.Delay(Timeout.Infinite, context.RequestAborted).ContinueWith(_ => { }, TaskScheduler.Default);
        });
        var (client, cluster, username) = await SignedInAsync(server);
        using var _ = client;
        const string query = "?follow=true&tailLines=1000&timestamps=true&sinceTime=2026-11-23T09%3A00%3A00Z&previous=true&container=app";

        using (var response = await client.GetAsync($"api/clusters/{cluster}/k8s{Log}{query}",
            HttpCompletionOption.ResponseHeadersRead, Ct).WaitAsync(TimeSpan.FromSeconds(15), Ct))
        {
            response.StatusCode.ShouldBe(HttpStatusCode.OK, "headers are flushed before the first line");
            await using var body = await response.Content.ReadAsStreamAsync(Ct);
            using var reader = new StreamReader(body);

            var clock = Stopwatch.StartNew();
            writeLine.SetResult();
            (await reader.ReadLineAsync(Ct).AsTask().WaitAsync(TimeSpan.FromSeconds(10), Ct)).ShouldBe("2026-11-23T09:00:01.000000001Z hello");
            clock.Elapsed.ShouldBeLessThan(TimeSpan.FromSeconds(2));
        }

        server.Requests.ShouldHaveSingleItem().RawTarget.ShouldBe(Log + query);
        await Task.Delay(TimeSpan.FromMilliseconds(300), Ct); // an entry would have been written by now
        (await _host.Data.AuditEntriesAsync(username)).ShouldNotContain(e => e.Category == AuditCategory.Proxy);
    }

    // 64 KiB of kubelet-style timestamped lines.
    private static byte[] LogChunk()
    {
        var line = Encoding.ASCII.GetBytes("2026-11-23T09:00:00.000000000Z GET /healthz 200 0.4ms fake-log-line\n");
        var chunk = new byte[Chunk];
        for (var i = 0; i < Chunk; i++)
        {
            chunk[i] = line[i % line.Length];
        }

        return chunk;
    }

    // A fresh user with a ReadWrite grant on a cluster at server, signed in over sockets.
    private async Task<(HttpClient Client, string Cluster, string Username)> SignedInAsync(FakeKubeApiServer server)
    {
        var username = _host.NewUsername();
        var (cluster, _) = await _host.Data.ProxyClusterAsync(server, username, AccessMode.ReadWrite);
        var client = _host.CreateKestrelBrowserClient();
        using var login = await _host.RunLoginAsync(client, username);
        login.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        return (client, cluster.Name, username);
    }

    /// <summary>The Kestrel variant shared by the class (default proxy settings).</summary>
    /// <param name="factory">The collection's default host, which creates the variant.</param>
    public sealed class Host(ApiFactory factory) : IAsyncLifetime
    {
        /// <summary>The variant.</summary>
        public ApiFactory Api { get; private set; } = null!;

        /// <inheritdoc />
        public async ValueTask InitializeAsync() =>
            Api = await factory.CreateVariantAsync(new Dictionary<string, string?>(), kestrel: true);

        /// <inheritdoc />
        public async ValueTask DisposeAsync() => await Api.DisposeAsync();
    }
}
