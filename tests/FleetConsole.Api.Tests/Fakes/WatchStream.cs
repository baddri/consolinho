using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using Microsoft.AspNetCore.Http;

namespace FleetConsole.Api.Tests.Fakes;

/// <summary>
/// A scripted Kubernetes watch on one path of a <see cref="FakeKubeApiServer"/> (from
/// <see cref="FakeKubeApiServer.MapWatch"/>): the client's <c>GET …?watch=…</c> gets <c>200</c>, <c>application/json</c>,
/// no <c>Content-Length</c> (chunked), and the response stays open; the test pushes events with <see cref="SendAsync"/>
/// (one JSON object per line, flushed immediately) and ends it with <see cref="CloseAsync"/>.
/// </summary>
/// <remarks>
/// Proxy streaming tests (QG-1, ADR-0020) use it to prove events arrive while the upstream response is still open, i.e.
/// nothing on the way buffers. One client at a time: a new watch connection replaces the previous one as the target of
/// <see cref="SendAsync"/>, but <see cref="Connected"/> only reports the first connection. After <see cref="CloseAsync"/>,
/// later connections end immediately. Like kube-apiserver, a positive <c>timeoutSeconds</c> query parameter ends the
/// response after that many seconds (ADR-0020: the proxy bounds watches only by capping <c>timeoutSeconds</c>).
/// </remarks>
[SuppressMessage("Naming", "CA1711:Identifiers should not have incorrect suffix", Justification = "Binding name from the T-0057 contract; it is a Kubernetes watch stream, not a System.IO.Stream.")]
[SuppressMessage("Design", "CA1001:Types that own disposable fields should be disposable", Justification = "The SemaphoreSlim never allocates a wait handle (AvailableWaitHandle is unused), so there is nothing to dispose.")]
public sealed class WatchStream
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly TaskCompletionSource<int> _connected = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource _closed = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly SemaphoreSlim _writeLock = new(1, 1);
    private readonly CancellationToken _serverStopping;
    private HttpContext? _client;
    private Task _served = Task.CompletedTask;

    /// <summary>Created by <see cref="FakeKubeApiServer.MapWatch"/>.</summary>
    /// <param name="serverStopping">Cancelled when the server is disposed, which ends a held-open response.</param>
    internal WatchStream(CancellationToken serverStopping) => _serverStopping = serverStopping;

    /// <summary>
    /// Completes once a client is attached and the response headers are sent; the value is the <c>timeoutSeconds</c>
    /// query parameter the client sent (0 if none), so tests can assert what the proxy forwarded.
    /// </summary>
    public Task<int> Connected => _connected.Task;

    /// <summary>
    /// Writes one watch event <c>{"type":…,"object":…}</c> plus a newline to the connected client and flushes it.
    /// Called before a client is attached, it waits for one.
    /// </summary>
    /// <param name="type">Event type, e.g. <c>ADDED</c>, <c>MODIFIED</c>, <c>DELETED</c>, <c>BOOKMARK</c>, <c>ERROR</c>.</param>
    /// <param name="object">The event object, serialized as JSON (camelCase).</param>
    /// <param name="ct">Cancels waiting for the client or the write.</param>
    /// <returns>A task that completes when the event has been flushed.</returns>
    [SuppressMessage("Naming", "CA1720:Identifier contains type name", Justification = "Mirrors the watch event's \"object\" field; binding name from the T-0057 contract.")]
    public async Task SendAsync(string type, object @object, CancellationToken ct)
    {
        await _connected.Task.WaitAsync(ct).ConfigureAwait(false);
        var line = JsonSerializer.SerializeToUtf8Bytes(new { type, @object }, Json);

        await _writeLock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var body = Volatile.Read(ref _client)!.Response.Body;
            await body.WriteAsync(line, ct).ConfigureAwait(false);
            await body.WriteAsync("\n"u8.ToArray(), ct).ConfigureAwait(false);
            await body.FlushAsync(ct).ConfigureAwait(false);
        }
        finally
        {
            _writeLock.Release();
        }
    }

    /// <summary>Ends the response (the client sees end of stream), as the API server does when a watch times out.</summary>
    /// <returns>A task that completes when the current response (if any) has ended.</returns>
    public Task CloseAsync()
    {
        _closed.TrySetResult();
        return Volatile.Read(ref _served);
    }

    /// <summary>
    /// Serves one watch request: sends the headers, signals <see cref="Connected"/>, holds the response open until
    /// <see cref="CloseAsync"/>, client abort, server stop or the request's <c>timeoutSeconds</c> (when &gt; 0) elapses.
    /// </summary>
    /// <param name="context">The watch request.</param>
    /// <returns>A task that completes when the response ends (close, client abort or server stop).</returns>
    internal Task ServeAsync(HttpContext context)
    {
        var served = HoldOpenAsync(context);
        Volatile.Write(ref _served, served);
        return served;
    }

    private async Task HoldOpenAsync(HttpContext context)
    {
        var timeoutSeconds = int.TryParse(context.Request.Query["timeoutSeconds"], out var seconds) ? seconds : 0;
        var response = context.Response;
        response.StatusCode = StatusCodes.Status200OK;
        response.ContentType = "application/json";

        // Send the headers now (no Content-Length → chunked), so the client sees the 200 before the first event.
        await response.StartAsync(context.RequestAborted).ConfigureAwait(false);
        await response.Body.FlushAsync(context.RequestAborted).ConfigureAwait(false);
        Volatile.Write(ref _client, context);
        _connected.TrySetResult(timeoutSeconds);

        using var linked = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted, _serverStopping);
        if (timeoutSeconds > 0)
        {
            // kube-apiserver ends a watch cleanly when its timeoutSeconds elapses; the proxy relies on that.
            linked.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
        }

        try
        {
            await _closed.Task.WaitAsync(linked.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // Timeout elapsed, client went away or the server is stopping: the response simply ends.
        }

        // Don't let the response complete under an in-flight SendAsync write.
        await _writeLock.WaitAsync(CancellationToken.None).ConfigureAwait(false);
        _writeLock.Release();
    }
}
