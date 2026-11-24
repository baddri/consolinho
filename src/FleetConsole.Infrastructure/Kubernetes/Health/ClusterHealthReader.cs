using System.Buffers;
using System.Net.Http.Headers;
using System.Text.Json;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Fleet;
using FleetConsole.Domain.Clusters;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Infrastructure.Kubernetes.Health;

/// <summary>
/// The fleet overview's <see cref="IClusterHealthReader"/> (ADR-0041 §2, contract §3): sends the distribution's
/// read-only probes through the cluster's forwarding-pool invoker (same TLS trust and pooled connections as the proxy),
/// concurrently, and reduces each answer to counts with <see cref="HealthResponseParser"/>.
/// </summary>
/// <remarks>
/// <para><b>Cheap reads:</b> list probes ask for server-side Tables without objects (<c>includeObject=None</c>), so a
/// 300-node cluster answers with a few KiB of cells; bodies are still read through a hard
/// <see cref="MaxResponseBytes"/> cap and an oversized answer is <see cref="ProbeFailureKind.InvalidResponse"/>.</para>
/// <para><b>Failures are data:</b> status, network, TLS and parse failures become a <see cref="ProbeFailure"/> through
/// <see cref="ProbeFailureClassifier"/>. The pooled handler is shared by concurrent requests, so its TLS record can't
/// attribute a handshake failure to this request: TLS failures are reported as <see cref="ProbeFailureKind.TlsOther"/>
/// (the connection test gives the precise reason).</para>
/// <para><b>Secrets:</b> the token is revealed only into the <c>Authorization</c> header. Logs carry the cluster id,
/// the probe name and the failure kind — no URL, body, header or token.</para>
/// <para><b>Cancellation:</b> the caller's token cancels every probe and propagates as
/// <see cref="OperationCanceledException"/>; the caller's budget decides whether that is a timeout. Singleton.</para>
/// </remarks>
internal sealed partial class ClusterHealthReader(IClusterForwardingClients clients, ILogger<ClusterHealthReader> logger)
    : IClusterHealthReader
{
    /// <summary>Upper bound for one probe's body; Table answers without objects are a few KiB even for large clusters.</summary>
    internal const int MaxResponseBytes = 4 * 1024 * 1024;

    private const string JsonAccept = "application/json";

    // A meta.k8s.io/v1 Table instead of the full list (contract §3); the server falls back to a plain list only if it
    // can't produce Tables, which the parser rejects as the wrong kind. Sent verbatim (the typed header would re-format
    // the parameters with spaces), so the wire value is exactly the contract's.
    private const string TableAccept = "application/json;as=Table;v=v1;g=meta.k8s.io";

    /// <inheritdoc />
    public async Task<ClusterHealthReading> ReadAsync(
        ClusterId clusterId,
        ClusterConnection connection,
        ClusterDistribution distribution,
        SensitiveString token,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(connection);
        ArgumentNullException.ThrowIfNull(token);

        var probes = FleetProbePaths.For(distribution);
        var host = connection.ApiUrl.Host;

        if (!clients.TryGetInvoker(clusterId, connection, out var invoker))
        {
            // The pool could not build a handler (unusable CA bundle); every probe fails the same way.
            Log.NoInvoker(logger, clusterId.Value);
            return Unusable(probes);
        }

        var context = new ProbeContext(clusterId, invoker, BaseUri(connection.ApiUrl), host, token);
        var pending = probes.ToDictionary(probe => probe.Path, probe => StartProbe(context, probe, cancellationToken));
        await Task.WhenAll(pending.Values).ConfigureAwait(false);

        return new ClusterHealthReading(
            Result<KubernetesVersionFacts>(pending, FleetProbePaths.KubernetesVersion),
            Result<ClusterVersionFacts>(pending, FleetProbePaths.ClusterVersion),
            Result<ClusterOperatorCounts>(pending, FleetProbePaths.ClusterOperators),
            Result<NodeCounts>(pending, FleetProbePaths.Nodes)
                ?? throw new InvalidOperationException("Every distribution probes the nodes."));
    }

    /// <summary>Starts the request for one <see cref="FleetProbePaths"/> entry with its Accept header and parser.</summary>
    private Task<object> StartProbe(ProbeContext context, FleetProbeRequest probe, CancellationToken cancellationToken) =>
        probe.Path switch
        {
            FleetProbePaths.KubernetesVersion => Box(SendAsync(context, probe, "KubernetesVersion", JsonAccept,
                HealthResponseParser.KubernetesVersion, cancellationToken)),
            FleetProbePaths.ClusterVersion => Box(SendAsync(context, probe, "ClusterVersion", JsonAccept,
                HealthResponseParser.ClusterVersion, cancellationToken)),
            FleetProbePaths.ClusterOperators => Box(SendAsync(context, probe, "ClusterOperators", TableAccept,
                HealthResponseParser.ClusterOperators, cancellationToken)),
            FleetProbePaths.Nodes => Box(SendAsync(context, probe, "Nodes", TableAccept,
                HealthResponseParser.Nodes, cancellationToken)),
            _ => throw new InvalidOperationException($"No parser for fleet probe {probe.Path}."),
        };

    /// <summary>
    /// Sends one probe and maps every outcome to a <see cref="ProbeResponse{T}"/>. Only the caller's cancellation escapes.
    /// </summary>
    private async Task<ProbeResponse<T>> SendAsync<T>(
        ProbeContext context,
        FleetProbeRequest probe,
        string probeName,
        string accept,
        Func<JsonElement, T?> parse,
        CancellationToken cancellationToken)
        where T : class
    {
        ProbeFailure failure;
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(context.BaseUri + probe.Path.TrimStart('/') + probe.QueryString));
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", context.Token.Reveal());
            request.Headers.TryAddWithoutValidation("Accept", accept);

            // HttpMessageInvoker never buffers: the body is read below, through the cap, and disposed with the response.
            using var response = await context.Invoker.SendAsync(request, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                failure = ProbeFailureClassifier.FromStatus(response.StatusCode, context.Host);
            }
            else if (await ParseBoundedAsync(response.Content, parse, cancellationToken).ConfigureAwait(false) is { } value)
            {
                return ProbeResponse<T>.Ok(value);
            }
            else
            {
                failure = ProbeFailureClassifier.InvalidResponse(context.Host);
            }
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            // Not the caller's token: the handler's own connect timeout.
            failure = ProbeFailureClassifier.Timeout(context.Host);
        }
        catch (HttpRequestException caught)
        {
            failure = ProbeFailureClassifier.FromHttpRequestException(caught, context.Host, tls: null);
        }
        catch (Exception caught) when (caught is JsonException or IOException)
        {
            // JsonException: not JSON (an HTML error page, a truncated body). IOException: the body ended prematurely.
            failure = ProbeFailureClassifier.InvalidResponse(context.Host);
        }

        // Deliberately without the exception: its message can quote the body (JsonException) or the request URL.
        Log.ProbeFailed(logger, context.ClusterId.Value, probeName, failure.Kind);
        return ProbeResponse<T>.Fail(failure);
    }

    /// <summary>
    /// Reads the body into a buffer of at most <see cref="MaxResponseBytes"/> and parses it; <see langword="null"/>
    /// when it is larger (rejected before reading if <c>Content-Length</c> says so) or <paramref name="parse"/> rejects it.
    /// </summary>
    private static async Task<T?> ParseBoundedAsync<T>(
        HttpContent content, Func<JsonElement, T?> parse, CancellationToken cancellationToken)
        where T : class
    {
        if (content.Headers.ContentLength > MaxResponseBytes)
        {
            return null;
        }

        var stream = await content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        await using (stream.ConfigureAwait(false))
        {
            using var buffer = new MemoryStream();
            var chunk = ArrayPool<byte>.Shared.Rent(81920);
            try
            {
                int read;
                while ((read = await stream.ReadAsync(chunk, cancellationToken).ConfigureAwait(false)) > 0)
                {
                    if (buffer.Length + read > MaxResponseBytes)
                    {
                        return null;
                    }

                    buffer.Write(chunk, 0, read);
                }
            }
            finally
            {
                ArrayPool<byte>.Shared.Return(chunk);
            }

            using var document = JsonDocument.Parse(buffer.GetBuffer().AsMemory(0, (int)buffer.Length));
            return parse(document.RootElement);
        }
    }

    /// <summary>Builds a reading in which every probe of the set has the same failure (no invoker).</summary>
    private static ClusterHealthReading Unusable(IReadOnlyList<FleetProbeRequest> probes)
    {
        var failure = new ProbeFailure(ProbeFailureKind.InvalidResponse,
            "The cluster's connection settings are unusable (CA bundle). Check the cluster in Fleet administration.");
        bool Has(string path) => probes.Any(probe => probe.Path == path);
        return new ClusterHealthReading(
            Has(FleetProbePaths.KubernetesVersion) ? ProbeResponse<KubernetesVersionFacts>.Fail(failure) : null,
            Has(FleetProbePaths.ClusterVersion) ? ProbeResponse<ClusterVersionFacts>.Fail(failure) : null,
            Has(FleetProbePaths.ClusterOperators) ? ProbeResponse<ClusterOperatorCounts>.Fail(failure) : null,
            ProbeResponse<NodeCounts>.Fail(failure));
    }

    private static async Task<object> Box<T>(Task<ProbeResponse<T>> task) => await task.ConfigureAwait(false);

    private static ProbeResponse<T>? Result<T>(Dictionary<string, Task<object>> pending, string path) =>
        pending.TryGetValue(path, out var task) ? (ProbeResponse<T>)task.Result : null;

    /// <summary>The API URL with exactly one trailing slash, so probe paths keep any path prefix of the URL.</summary>
    private static string BaseUri(Uri apiUrl)
    {
        var left = apiUrl.GetLeftPart(UriPartial.Path);
        return left.EndsWith('/') ? left : left + "/";
    }

    /// <summary>What every probe of one <see cref="ReadAsync"/> call shares.</summary>
    private sealed record ProbeContext(
        ClusterId ClusterId, HttpMessageInvoker Invoker, string BaseUri, string Host, SensitiveString Token);

    /// <summary>Source-generated log messages of the reader.</summary>
    private static partial class Log
    {
        [LoggerMessage(EventId = 3700, Level = LogLevel.Warning,
            Message = "Fleet health of cluster {ClusterId} not read: no forwarding client (unusable connection settings)")]
        public static partial void NoInvoker(ILogger logger, Guid clusterId);

        [LoggerMessage(EventId = 3701, Level = LogLevel.Debug,
            Message = "Fleet health probe {Probe} of cluster {ClusterId} failed: {FailureKind}")]
        public static partial void ProbeFailed(
            ILogger logger, Guid clusterId, string probe, ProbeFailureKind failureKind);
    }
}
