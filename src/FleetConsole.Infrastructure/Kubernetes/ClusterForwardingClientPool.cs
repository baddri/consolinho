using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Domain.Clusters;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Infrastructure.Kubernetes;

/// <summary>
/// The proxy's per-cluster invoker pool (ADR-0020 §1): one long-lived <see cref="HttpMessageInvoker"/> per cluster,
/// built by <see cref="ClusterTlsHandlerFactory.CreateForwarding"/> with that cluster's own trust (PRX-7). Singleton.
/// </summary>
/// <remarks>
/// <para>Each entry remembers the <see cref="ClusterConnection"/> it was built from. A request whose connection differs
/// (value equality: URL, CA PEM, skip flag) replaces the entry, so an admin edit takes effect on the next request with
/// no invalidation events. Lookups of an unchanged cluster are lock-free; building takes a per-cluster lock so
/// concurrent first requests build one handler.</para>
/// <para>A replaced entry may still carry open watches, so it is disposed only after
/// <see cref="RetiredHandlerGracePeriod"/>, via a <see cref="TimeProvider"/> timer. Deleted clusters keep their entry
/// until shutdown (at most ~40, accepted by ADR-0020). <see cref="Dispose"/> disposes everything.</para>
/// </remarks>
/// <param name="factory">Builds the forwarding handlers.</param>
/// <param name="time">Schedules disposal of retired handlers (a fake in tests).</param>
/// <param name="logger">Logs rebuilds and unusable CA bundles — cluster id only, never URLs or CA content.</param>
internal sealed partial class ClusterForwardingClientPool(
    ClusterTlsHandlerFactory factory, TimeProvider time, ILogger<ClusterForwardingClientPool> logger)
    : IClusterForwardingClients, IDisposable
{
    /// <summary>Default for <see cref="RetiredHandlerGracePeriod"/>: the 5-minute watch cap plus an idle margin.</summary>
    public static readonly TimeSpan DefaultRetiredHandlerGracePeriod = TimeSpan.FromMinutes(6);

    private readonly ConcurrentDictionary<ClusterId, Entry> _entries = new();
    private readonly ConcurrentDictionary<ClusterId, Lock> _buildLocks = new();

    // Replaced entries waiting for their grace period, with the timer that will dispose them. Removing from this map is
    // the "claim" that makes disposal happen exactly once, whether the timer or Dispose() gets there first.
    private readonly ConcurrentDictionary<Entry, ITimer> _retired = new();

    private volatile bool _disposed;

    /// <summary>
    /// How long a replaced handler stays alive so in-flight requests and open watches can finish. Independent of the
    /// proxy options on purpose (they arrive later and only bound the default).
    /// </summary>
    public TimeSpan RetiredHandlerGracePeriod { get; init; } = DefaultRetiredHandlerGracePeriod;

    /// <inheritdoc />
    public bool TryGetInvoker(
        ClusterId clusterId, ClusterConnection connection, [NotNullWhen(true)] out HttpMessageInvoker? invoker)
    {
        ArgumentNullException.ThrowIfNull(connection);
        ObjectDisposedException.ThrowIf(_disposed, this);

        // Fast path: the common case is an unchanged cluster. A concurrently replaced entry is still valid for the
        // whole grace period, so returning it is safe.
        if (_entries.TryGetValue(clusterId, out var current) && current.Connection == connection)
        {
            invoker = current.Invoker;
            return true;
        }

        lock (_buildLocks.GetOrAdd(clusterId, _ => new Lock()))
        {
            // Another request may have built it while we waited.
            if (_entries.TryGetValue(clusterId, out current) && current.Connection == connection)
            {
                invoker = current.Invoker;
                return true;
            }

            ClusterTlsHandler handler;
            try
            {
                handler = factory.CreateForwarding(connection);
            }
            catch (InvalidCaBundleException)
            {
                // Nothing is cached, so a fixed bundle works on the next request. The exception is not logged: it
                // carries no CA text, but it adds nothing for the operator either.
                Log.InvalidCaBundle(logger, clusterId.Value);
                invoker = null;
                return false;
            }

            var entry = new Entry(connection, handler);
            _entries[clusterId] = entry;

            if (current is not null)
            {
                Retire(current);
                Log.Rebuilt(logger, clusterId.Value);
            }

            if (_disposed)
            {
                // Dispose() ran while we were building and may have missed this entry.
                entry.Dispose();
                ObjectDisposedException.ThrowIf(true, this);
            }

            invoker = entry.Invoker;
            return true;
        }
    }

    /// <summary>Disposes every handler, current and retired, and cancels the pending retirement timers.</summary>
    public void Dispose()
    {
        _disposed = true;

        foreach (var clusterId in _entries.Keys)
        {
            if (_entries.TryRemove(clusterId, out var entry))
            {
                entry.Dispose();
            }
        }

        foreach (var retired in _retired.Keys)
        {
            DisposeRetired(retired);
        }
    }

    private void Retire(Entry entry)
    {
        // Register the timer unarmed and arm it afterwards, so even a zero grace period can't fire before the entry is
        // in _retired (the callback would then find nothing to dispose and leak the handler). Infinite period: fires once.
        var timer = time.CreateTimer(
            static state =>
            {
                var (pool, retired) = ((ClusterForwardingClientPool, Entry))state!;
                pool.DisposeRetired(retired);
            },
            (this, entry),
            Timeout.InfiniteTimeSpan,
            Timeout.InfiniteTimeSpan);
        _retired[entry] = timer;

        if (_disposed)
        {
            // Dispose() may already have swept _retired; don't leave this one behind.
            DisposeRetired(entry);
            return;
        }

        timer.Change(RetiredHandlerGracePeriod, Timeout.InfiniteTimeSpan);
    }

    private void DisposeRetired(Entry entry)
    {
        if (_retired.TryRemove(entry, out var timer))
        {
            timer.Dispose();
            entry.Dispose();
        }
    }

    /// <summary>One cluster's invoker and the settings it was built from.</summary>
    private sealed class Entry(ClusterConnection connection, ClusterTlsHandler handler) : IDisposable
    {
        private int _disposed;

        /// <summary>The settings the handler trusts; compared by value on every lookup.</summary>
        public ClusterConnection Connection { get; } = connection;

        /// <summary>The invoker handed to the proxy; does not own the handler.</summary>
        public HttpMessageInvoker Invoker { get; } = new(handler.Handler, disposeHandler: false);

        /// <summary>Disposes the invoker, handler and trusted certificates once, even if called from several paths.</summary>
        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) == 0)
            {
                Invoker.Dispose();
                handler.Dispose();
            }
        }
    }

    /// <summary>Source-generated log messages (cluster id only — never URLs or CA content).</summary>
    private static partial class Log
    {
        [LoggerMessage(EventId = 3400, Level = LogLevel.Information,
            Message = "Rebuilt forwarding client for cluster {ClusterId}")]
        public static partial void Rebuilt(ILogger logger, Guid clusterId);

        [LoggerMessage(EventId = 3401, Level = LogLevel.Warning,
            Message = "The stored CA bundle of cluster {ClusterId} contains no readable PEM certificate; proxied requests fail until an admin fixes it")]
        public static partial void InvalidCaBundle(ILogger logger, Guid clusterId);
    }
}
