using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Threading.Channels;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Access;
using FleetConsole.Application.Clusters.ListAccessibleClusters;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Application.Fleet.GetFleetStatus;

/// <summary>
/// The answer of <see cref="GetFleetStatusQuery"/>: the clusters the user may access, probed lazily — nothing is sent
/// upstream until <see cref="ReadAllAsync"/> is enumerated, so the endpoint (T-0323) decides when work begins and the
/// request token governs it.
/// </summary>
/// <remarks>
/// <para>
/// <b>Bounded:</b> at most <c>Fleet:MaxClusterConcurrency</c> clusters are probed at once; lines are yielded in
/// completion order, so one slow cluster never holds back the others (ADR-0041 §1, §5).
/// </para>
/// <para>
/// <b>Isolated:</b> an unexpected exception from one cluster's probe is logged and becomes that cluster's
/// <see cref="FleetClusterFailure.UpstreamError"/> line; cancellation is never swallowed.
/// </para>
/// <para>Enumerate once: every enumeration probes again (the probe's cache makes a repeat cheap, not free).</para>
/// </remarks>
[SuppressMessage("Naming", "CA1711:Identifiers should not have incorrect suffix",
    Justification = "Named by the CP5 contract (T-0321); it is a stream of lines, not a System.IO.Stream.")]
public sealed partial class FleetStatusStream
{
    private readonly IReadOnlyList<ResolvedClusterAccess> _accesses;
    private readonly IClusterHealthProbe? _probe;
    private readonly UserId _userId;
    private readonly bool _sessionIsReadOnly;
    private readonly IClock? _clock;
    private readonly int _maxClusterConcurrency;
    private readonly ILogger? _logger;

    /// <summary>Creates the stream over the user's resolved accesses; probing starts in <see cref="ReadAllAsync"/>.</summary>
    /// <param name="accesses">The user's resolved access per cluster (current resolution, never cached).</param>
    /// <param name="probe">Produces one cluster's facts; shared by the parallel loop, concurrency-safe by contract.</param>
    /// <param name="userId">The signed-in user.</param>
    /// <param name="sessionIsReadOnly">The session's read-only flag, passed to the probe's policy context.</param>
    /// <param name="clock">Stamps the line of a cluster whose probe threw.</param>
    /// <param name="maxClusterConcurrency">How many clusters are probed at once.</param>
    /// <param name="logger">Receives unexpected per-cluster probe errors.</param>
    internal FleetStatusStream(
        IReadOnlyList<ResolvedClusterAccess> accesses,
        IClusterHealthProbe probe,
        UserId userId,
        bool sessionIsReadOnly,
        IClock clock,
        int maxClusterConcurrency,
        ILogger logger)
    {
        ArgumentNullException.ThrowIfNull(accesses);
        ArgumentNullException.ThrowIfNull(probe);
        ArgumentNullException.ThrowIfNull(clock);
        ArgumentNullException.ThrowIfNull(logger);
        ArgumentOutOfRangeException.ThrowIfLessThan(maxClusterConcurrency, 1);
        _accesses = accesses;
        _probe = probe;
        _userId = userId;
        _sessionIsReadOnly = sessionIsReadOnly;
        _clock = clock;
        _maxClusterConcurrency = maxClusterConcurrency;
        _logger = logger;
    }

    private FleetStatusStream()
    {
        _accesses = [];
        _userId = default;
    }

    /// <summary>A stream without clusters (no signed-in user id): enumerates nothing.</summary>
    internal static FleetStatusStream Empty { get; } = new();

    /// <summary>
    /// How many lines the stream will yield: one per accessible cluster. Known before probing, so the endpoint can
    /// log it and the SPA's pending rows (from <c>GET /api/clusters</c>) line up.
    /// </summary>
    public int ClusterCount => _accesses.Count;

    /// <summary>
    /// Probes every cluster with bounded parallelism and yields each cluster's line as soon as it completes.
    /// </summary>
    /// <param name="cancellationToken">
    /// The request's token. Cancelling it — or disposing the enumerator early (client gone) — cancels every in-flight
    /// probe, so none outlives the request; cancellation surfaces as <see cref="OperationCanceledException"/>.
    /// </param>
    /// <returns>Exactly <see cref="ClusterCount"/> lines when enumerated to the end, in completion order.</returns>
    public async IAsyncEnumerable<FleetClusterStatusDto> ReadAllAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        if (_accesses.Count == 0)
        {
            yield break;
        }

        // Linked so stopping early (enumerator disposed without the caller's token being cancelled) still ends the probes.
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

        // Capacity = cluster count: producers never wait for a slow consumer, and memory stays bounded by the fleet size.
        var channel = Channel.CreateBounded<FleetClusterStatusDto>(new BoundedChannelOptions(_accesses.Count)
        {
            SingleReader = true,
            SingleWriter = false,
        });
        var producer = ProduceAsync(channel.Writer, linked.Token);

        try
        {
            await foreach (var line in channel.Reader.ReadAllAsync(linked.Token).ConfigureAwait(false))
            {
                yield return line;
            }
        }
        finally
        {
            // A no-op after a full read (the producer is done); otherwise it stops the probes still in flight.
            await linked.CancelAsync().ConfigureAwait(false);
            try
            {
                // Awaited so a producer fault is observed (and rethrown) rather than lost.
                await producer.ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (linked.IsCancellationRequested)
            {
                // Expected: we cancelled it, or the caller did — in which case the reader already threw.
            }
        }
    }

    private async Task ProduceAsync(ChannelWriter<FleetClusterStatusDto> writer, CancellationToken cancellationToken)
    {
        try
        {
            var parallel = new ParallelOptions
            {
                MaxDegreeOfParallelism = _maxClusterConcurrency,
                CancellationToken = cancellationToken,
            };
            await Parallel.ForEachAsync(_accesses, parallel, async (access, token) =>
            {
                var line = await ProbeOneAsync(access, token).ConfigureAwait(false);
                await writer.WriteAsync(line, token).ConfigureAwait(false);
            }).ConfigureAwait(false);
        }
        finally
        {
            // Ends the consumer's read loop whether all clusters finished or the loop was cancelled/faulted.
            writer.TryComplete();
        }
    }

    private async Task<FleetClusterStatusDto> ProbeOneAsync(ResolvedClusterAccess access, CancellationToken cancellationToken)
    {
        // Identity and access mode come from this request's resolution, never from the cached facts.
        var cluster = AccessibleClusterDto.From(access);
        try
        {
            var facts = await _probe!.ProbeAsync(access, _userId, _sessionIsReadOnly, cancellationToken).ConfigureAwait(false);
            return facts.ToStatus(cluster);
        }
        catch (Exception exception) when (exception is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            // A bug or infrastructure fault in one cluster's probe must not take the fleet down: it becomes that line's
            // failure. Only cancellation of the request itself propagates.
            Log.ProbeFailed(_logger!, access.ClusterId.Value, exception);
            return ClusterHealthFacts.Failed(_clock!.UtcNow, FleetClusterFailure.UpstreamError).ToStatus(cluster);
        }
    }

    /// <summary>Source-generated log messages; ids only, never names, URLs or tokens.</summary>
    private static partial class Log
    {
        [LoggerMessage(EventId = 5310, Level = LogLevel.Error,
            Message = "Fleet probe of cluster {ClusterId} failed unexpectedly; reported as upstreamError")]
        public static partial void ProbeFailed(ILogger logger, Guid clusterId, Exception exception);
    }
}
