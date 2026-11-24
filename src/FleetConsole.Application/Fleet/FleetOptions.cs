namespace FleetConsole.Application.Fleet;

/// <summary>
/// Settings of the fleet overview (configuration section <c>Fleet</c>, ADR-0041 §3 and §5): how many clusters one
/// request probes at once, each cluster's budget, how long probe facts are cached, and the per-pod limit on concurrent
/// fleet requests. Injected as <c>IOptions&lt;FleetOptions&gt;</c>; bound and validated on start by the Api (T-0323).
/// </summary>
public sealed class FleetOptions
{
    /// <summary>The configuration section name.</summary>
    public const string SectionName = "Fleet";

    /// <summary>The validation failure message; names the keys and their bounds, never a value.</summary>
    public const string InvalidMessage =
        "Fleet options are out of range: MaxClusterConcurrency 1..32, ClusterTimeout 00:00:01..00:00:30, "
        + "CacheDuration 00:00:01..00:01:00, MaxConcurrentRequests 1..256, RequestQueueLimit 0..1024.";

    /// <summary>Lower bound of <see cref="ClusterTimeout"/>.</summary>
    public static readonly TimeSpan MinClusterTimeout = TimeSpan.FromSeconds(1);

    /// <summary>Upper bound of <see cref="ClusterTimeout"/>: a dead cluster must not hold a fleet line for longer.</summary>
    public static readonly TimeSpan MaxClusterTimeout = TimeSpan.FromSeconds(30);

    /// <summary>Lower bound of <see cref="CacheDuration"/> (same as <c>Cache:Duration</c>).</summary>
    public static readonly TimeSpan MinCacheDuration = TimeSpan.FromSeconds(1);

    /// <summary>
    /// Upper bound of <see cref="CacheDuration"/> (same as <c>Cache:Duration</c>): the duration is the worst-case
    /// staleness of a fleet line, and of a lost invalidation.
    /// </summary>
    public static readonly TimeSpan MaxCacheDuration = TimeSpan.FromSeconds(60);

    /// <summary>
    /// How many clusters one fleet request probes at the same time (<c>Fleet:MaxClusterConcurrency</c>, default 10,
    /// 1..32). Bounds the load one page puts on the pod and on the network.
    /// </summary>
    public int MaxClusterConcurrency { get; set; } = 10;

    /// <summary>
    /// The budget of one cluster's probes together (<c>Fleet:ClusterTimeout</c>, default 5 s, 1..30 s); exceeding it
    /// yields the <c>timeout</c> failure, which is cached like any other outcome.
    /// </summary>
    public TimeSpan ClusterTimeout { get; set; } = TimeSpan.FromSeconds(5);

    /// <summary>
    /// How long one (cluster, credential)'s probe facts are cached (<c>Fleet:CacheDuration</c>, default 30 s, 1..60 s).
    /// "Refresh" within this window returns the same <c>checkedAt</c>.
    /// </summary>
    public TimeSpan CacheDuration { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>
    /// How many fleet requests one pod computes at once (<c>Fleet:MaxConcurrentRequests</c>, default 16, 1..256); the
    /// rest queue, then get 503 <c>Fleet.Busy</c>.
    /// </summary>
    public int MaxConcurrentRequests { get; set; } = 16;

    /// <summary>How many fleet requests may wait for a slot (<c>Fleet:RequestQueueLimit</c>, default 64, 0..1024).</summary>
    public int RequestQueueLimit { get; set; } = 64;

    /// <summary>Whether every setting lies within its documented bounds.</summary>
    /// <returns><see langword="true"/> when valid.</returns>
    public bool IsValid() =>
        MaxClusterConcurrency is >= 1 and <= 32
        && ClusterTimeout >= MinClusterTimeout && ClusterTimeout <= MaxClusterTimeout
        && CacheDuration >= MinCacheDuration && CacheDuration <= MaxCacheDuration
        && MaxConcurrentRequests is >= 1 and <= 256
        && RequestQueueLimit is >= 0 and <= 1024;
}
