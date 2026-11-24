namespace FleetConsole.Infrastructure.Caching;

/// <summary>
/// Settings of the query cache (configuration section <c>Cache</c>, ADR-0040 §6). Bound and validated on start by
/// <see cref="CachingSetup.AddQueryCache"/>.
/// </summary>
internal sealed class CacheOptions
{
    /// <summary>The configuration section name.</summary>
    public const string SectionName = "Cache";

    /// <summary>Lower bound of <see cref="Duration"/>: shorter entries would barely cache at all.</summary>
    public static readonly TimeSpan MinDuration = TimeSpan.FromSeconds(1);

    /// <summary>
    /// Upper bound of <see cref="Duration"/>: the duration is also the worst-case staleness after a lost invalidation
    /// (Redis outage, lost post-commit notification), so it is capped at one minute (CACHE-4).
    /// </summary>
    public static readonly TimeSpan MaxDuration = TimeSpan.FromSeconds(60);

    /// <summary>The validation failure message; names the key, never a value.</summary>
    public const string InvalidDurationMessage = "Cache:Duration must be between 00:00:01 and 00:01:00.";

    /// <summary>
    /// How long an entry lives in memory and in Redis (<c>Cache:Duration</c>, default 30 s). Invalidation normally
    /// removes entries much sooner; this bounds staleness when it doesn't.
    /// </summary>
    public TimeSpan Duration { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>Whether <see cref="Duration"/> lies within <see cref="MinDuration"/>..<see cref="MaxDuration"/>.</summary>
    /// <returns><see langword="true"/> when valid.</returns>
    public bool IsValid() => Duration >= MinDuration && Duration <= MaxDuration;
}
