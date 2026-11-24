using System.Diagnostics;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Caching;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Access;
using FleetConsole.Application.Proxy;
using FleetConsole.Application.Proxy.Requests;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FleetConsole.Application.Fleet;

/// <summary>
/// <see cref="IClusterHealthProbe"/>: runs the proxy policy chain for each probe request, then reads the cluster's
/// facts through <see cref="IQueryCache"/> keyed by (cluster, winning credential), probing upstream with
/// <see cref="IClusterHealthReader"/> on a miss (ADR-0041 §2–§6).
/// </summary>
/// <remarks>
/// <para><b>Policies.</b> The context is built exactly as <c>AuthorizeProxyRequestHandler</c> builds it (winner's own
/// mode, stored ∨ session read-only), so the fleet page can never read what the proxy would refuse. A refusal returns
/// <see cref="FleetClusterFailure.BlockedByPolicy"/> facts: not cached, nothing decrypted, nothing sent.</para>
/// <para><b>Cache.</b> What a probe sees depends on the token alone, so the key is the credential, not the user:
/// users sharing a credential share the entry. Every outcome is cached, failures included — that is what keeps 50
/// users from each waiting <c>Fleet:ClusterTimeout</c> on a dead cluster. Invalidation needs nothing new:
/// <see cref="AccessCacheInvalidation"/> already removes the <c>cluster:</c> and <c>credential:</c> tags.</para>
/// <para><b>Budget.</b> The loader links the caller's token with <c>Fleet:ClusterTimeout</c>; the budget running out
/// becomes <see cref="FleetClusterFailure.Timeout"/> facts, the caller cancelling propagates. Other exceptions propagate
/// too — the fleet stream isolates them per cluster.</para>
/// <para>Stateless; safe for concurrent calls.</para>
/// </remarks>
/// <param name="policies">The proxy policy chain, in registration order.</param>
/// <param name="cache">The query cache (per-call duration <c>Fleet:CacheDuration</c>).</param>
/// <param name="tokenProtector">Decrypts the winner's token, inside the loader only.</param>
/// <param name="reader">Sends the probes upstream.</param>
/// <param name="clock">Supplies <c>checkedAt</c>.</param>
/// <param name="metrics">Records the probe duration.</param>
/// <param name="options">The fleet settings.</param>
/// <param name="logger">Logs one line per upstream probe.</param>
internal sealed partial class ClusterHealthProbe(
    IEnumerable<IProxyPolicy> policies,
    IQueryCache cache,
    ITokenProtector tokenProtector,
    IClusterHealthReader reader,
    IClock clock,
    FleetMetrics metrics,
    IOptions<FleetOptions> options,
    ILogger<ClusterHealthProbe> logger) : IClusterHealthProbe
{
    // Parsed once: the paths are constants, so a parse failure is a bug caught by the first use (and by the tests).
    private static readonly ProxyRequest[] OpenShiftRequests = ToProxyRequests(ClusterDistribution.OpenShift);
    private static readonly ProxyRequest[] KubernetesRequests = ToProxyRequests(ClusterDistribution.Kubernetes);

    /// <inheritdoc />
    public async Task<ClusterHealthFacts> ProbeAsync(
        ResolvedClusterAccess access,
        UserId userId,
        bool sessionIsReadOnly,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(access);

        if (!await PoliciesAllowAsync(access, userId, sessionIsReadOnly, cancellationToken).ConfigureAwait(false))
        {
            return ClusterHealthFacts.Failed(clock.UtcNow, FleetClusterFailure.BlockedByPolicy);
        }

        var credentialId = access.Resolution.Winner.CredentialId;
        var settings = options.Value;
        string[] tags = [CacheTags.Cluster(access.ClusterId), CacheTags.Credential(credentialId)];

        return await cache.GetOrLoadAsync(
            CacheKey(access.ClusterId, credentialId.Value),
            ct => LoadAsync(access, settings.ClusterTimeout, ct),
            _ => tags,
            settings.CacheDuration,
            cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// <c>fleet-health:v1:cluster:{id}:credential:{id}</c>. Bump <c>v1</c> on any change to the shape of
    /// <see cref="ClusterHealthFacts"/>, so a shared (Redis) cache never hands an old shape to new code.
    /// </summary>
    /// <param name="clusterId">The cluster.</param>
    /// <param name="credentialId">The winning grant's credential id.</param>
    /// <returns>The key.</returns>
    internal static string CacheKey(ClusterId clusterId, Guid credentialId) =>
        $"fleet-health:v1:cluster:{clusterId.Value:D}:credential:{credentialId:D}";

    private async Task<bool> PoliciesAllowAsync(
        ResolvedClusterAccess access, UserId userId, bool sessionIsReadOnly, CancellationToken cancellationToken)
    {
        var requests = access.Distribution == ClusterDistribution.Kubernetes ? KubernetesRequests : OpenShiftRequests;
        foreach (var request in requests)
        {
            var context = new ProxyRequestContext(
                userId,
                access.Username,
                access.ClusterName.Value,
                access.Environment,
                access.Resolution.Winner.AccessMode,
                access.StoredUserIsReadOnly || sessionIsReadOnly,
                request);

            // Registration order, first refusal wins — as in the proxy. The refusal's reason is not needed: the line
            // only says "blocked by policy".
            foreach (var policy in policies)
            {
                var decision = await policy.EvaluateAsync(context, cancellationToken).ConfigureAwait(false);
                if (decision.IsFailure)
                {
                    return false;
                }
            }
        }

        return true;
    }

    private async Task<ClusterHealthFacts> LoadAsync(ResolvedClusterAccess access, TimeSpan budget, CancellationToken cancellationToken)
    {
        var started = Stopwatch.GetTimestamp();

        // Decrypted here, on a miss only: a cache hit touches no key material.
        var token = tokenProtector.Unprotect(access.WinnerToken);

        ClusterHealthFacts facts;
        using (var budgetSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken))
        {
            budgetSource.CancelAfter(budget);
            try
            {
                var reading = await reader.ReadAsync(
                    access.ClusterId, access.Connection, access.Distribution, token, budgetSource.Token).ConfigureAwait(false);
                facts = ClusterHealthFactsMapper.Map(reading, clock.UtcNow);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                // Our budget ran out, not the caller's: that is data about the cluster, cached like any outcome.
                facts = ClusterHealthFacts.Failed(clock.UtcNow, FleetClusterFailure.Timeout);
            }
        }

        var elapsedMs = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
        var outcome = OutcomeCategory(facts);
        var level = facts.Failure is null && outcome != Restricted ? LogLevel.Debug : LogLevel.Information;
        LogProbed(logger, level, access.ClusterId.Value, outcome, elapsedMs);
        metrics.RecordProbe(elapsedMs, outcome);
        return facts;
    }

    private const string Restricted = "restricted";

    /// <summary>
    /// The low-cardinality outcome of one load, for the log and the metric tag: the failure's wire name, else
    /// <c>restricted</c> when any section was forbidden, else <c>ok</c>.
    /// </summary>
    private static string OutcomeCategory(ClusterHealthFacts facts) => facts.Failure switch
    {
        FleetClusterFailure.Unreachable => "unreachable",
        FleetClusterFailure.Timeout => "timeout",
        FleetClusterFailure.TlsError => "tlsError",
        FleetClusterFailure.TokenInvalid => "tokenInvalid",
        FleetClusterFailure.UpstreamError => "upstreamError",
        FleetClusterFailure.BlockedByPolicy => "blockedByPolicy",
        null when facts.KubernetesVersion?.Outcome == FleetProbeOutcome.Forbidden
            || facts.ClusterVersion?.Outcome == FleetProbeOutcome.Forbidden
            || facts.ClusterOperators?.Outcome == FleetProbeOutcome.Forbidden
            || facts.Nodes?.Outcome == FleetProbeOutcome.Forbidden => Restricted,
        _ => "ok",
    };

    private static ProxyRequest[] ToProxyRequests(ClusterDistribution distribution) =>
        [.. FleetProbePaths.For(distribution).Select(probe =>
            ProxyPath.TryParse(probe.Path, out var path)
                ? ProxyRequest.Create("GET", path, probe.QueryString, isUpgrade: false, contentLength: null)
                : throw new InvalidOperationException($"Fleet probe path '{probe.Path}' is not a valid proxy path."))];

    // Cluster id, outcome and timing only: never the token, URL query or body (FBE-6, SECURITY.md).
    [LoggerMessage(EventId = 5300, Message = "Fleet probe of cluster {ClusterId} finished: {Outcome} in {ElapsedMs:F1} ms")]
    private static partial void LogProbed(ILogger logger, LogLevel level, Guid clusterId, string outcome, double elapsedMs);
}
