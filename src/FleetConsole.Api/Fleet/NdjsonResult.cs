using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Fleet;

/// <summary>
/// A 200 response that streams <typeparamref name="T"/> items as newline-delimited JSON (<c>application/x-ndjson</c>):
/// one object per line, serialized with the API's JSON options (camelCase, string enums) and flushed as soon as it is
/// produced, so the client renders each line while later ones are still being computed (ADR-0041 §1).
/// </summary>
/// <remarks>
/// <para>Never buffers: the items are pulled one at a time and written straight to the response body.</para>
/// <para>Enumeration uses <c>HttpContext.RequestAborted</c>, so a client that goes away cancels the producer (for the
/// fleet: every in-flight probe); that ends the response quietly — it is not an error.</para>
/// <para>The response has started once the headers are flushed, so errors must be reported before this result
/// executes (the endpoint maps a failed query to ProblemDetails first).</para>
/// </remarks>
/// <typeparam name="T">The line type; its schema is published with <c>.Produces&lt;T&gt;(200, "application/x-ndjson")</c>.</typeparam>
/// <param name="items">The lines, enumerated once.</param>
public sealed class NdjsonResult<T>(IAsyncEnumerable<T> items) : IResult
{
    /// <summary>The NDJSON media type.</summary>
    public const string ContentType = "application/x-ndjson";

    private static readonly byte[] NewLine = "\n"u8.ToArray();

    /// <inheritdoc />
    public async Task ExecuteAsync(HttpContext httpContext)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        var response = httpContext.Response;
        var aborted = httpContext.RequestAborted;
        var serializerOptions = httpContext.RequestServices.GetRequiredService<IOptions<JsonOptions>>().Value.SerializerOptions;
        var typeInfo = (JsonTypeInfo<T>)serializerOptions.GetTypeInfo(typeof(T));

        response.StatusCode = StatusCodes.Status200OK;
        response.ContentType = ContentType;
        response.Headers.CacheControl = "no-store";

        // Each line must leave the server when written, not when a buffer (e.g. response compression) fills.
        httpContext.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();

        try
        {
            // Headers go out immediately, so the client knows the stream is open even before the first cluster answers.
            // (Flushing too, not only StartAsync: some servers, e.g. the in-memory test server, release headers on flush.)
            await response.StartAsync(aborted).ConfigureAwait(false);
            await response.Body.FlushAsync(aborted).ConfigureAwait(false);
            await foreach (var item in items.WithCancellation(aborted).ConfigureAwait(false))
            {
                await JsonSerializer.SerializeAsync(response.Body, item, typeInfo, aborted).ConfigureAwait(false);
                await response.Body.WriteAsync(NewLine, aborted).ConfigureAwait(false);
                await response.Body.FlushAsync(aborted).ConfigureAwait(false);
            }
        }
        catch (Exception exception) when (exception is OperationCanceledException or IOException && aborted.IsCancellationRequested)
        {
            // The client went away (closed tab, aborted fetch): the producer is cancelled, nothing to report.
        }
    }
}
