namespace FleetConsole.Application.Abstractions.Caching;

/// <summary>
/// The only cache API the Application layer sees (ADR-0040 §2): a two-level cache (per-process memory + shared Redis,
/// kept coherent across replicas by a backplane) addressed by key, with entries grouped by <b>result-derived tags</b> so
/// a write can invalidate every entry that depends on what it changed.
/// </summary>
/// <remarks>
/// <para>Implemented in Infrastructure on FusionCache; FusionCache types never leak past that adapter. Use cases don't
/// call it directly for reads: a query opts in by implementing <see cref="ICacheableQuery{TValue}"/>, and the
/// <c>CachingBehavior</c> calls <see cref="GetOrLoadAsync{TValue}(string, Func{CancellationToken, Task{TValue}}, Func{TValue, IReadOnlyCollection{string}}, CancellationToken)"/>. Invalidation (post-commit event handlers) calls
/// <see cref="RemoveByTagsAsync"/> with tags built by <see cref="CacheTags"/>.</para>
/// <para>Fail-safe is off: when an entry has expired and the loader throws, the exception propagates; a stale value is
/// never served (CACHE-5). Values must be serializable with System.Text.Json (they travel through Redis) and must not
/// contain secrets in clear (ADR-0040 §5).</para>
/// </remarks>
public interface IQueryCache
{
    /// <summary>
    /// Returns the cached value for <paramref name="key"/>, or runs <paramref name="load"/> once (concurrent callers for
    /// the same key in this process wait for the same load), caches its result under the tags <paramref name="tagsFor"/>
    /// derives from it, and returns it.
    /// </summary>
    /// <typeparam name="TValue">The cached value type; System.Text.Json serializable.</typeparam>
    /// <param name="key">The versioned cache key (e.g. <c>access:v1:user:{id}</c>); bump the version on shape changes.</param>
    /// <param name="load">Produces the value on a miss. An exception it throws propagates and nothing is cached.</param>
    /// <param name="tagsFor">The tags of a freshly loaded value (built with <see cref="CacheTags"/>).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The cached or freshly loaded value.</returns>
    ValueTask<TValue> GetOrLoadAsync<TValue>(
        string key,
        Func<CancellationToken, Task<TValue>> load,
        Func<TValue, IReadOnlyCollection<string>> tagsFor,
        CancellationToken cancellationToken);

    /// <summary>
    /// Like <see cref="GetOrLoadAsync{TValue}(string, Func{CancellationToken, Task{TValue}}, Func{TValue, IReadOnlyCollection{string}}, CancellationToken)"/>,
    /// but a freshly loaded entry lives for <paramref name="duration"/> instead of the cache's default
    /// (<c>Cache:Duration</c>). For caches with their own staleness budget, such as the fleet probe facts
    /// (<c>Fleet:CacheDuration</c>, ADR-0041 §3); every other entry option (fail-safe off, timeouts) stays the default.
    /// </summary>
    /// <typeparam name="TValue">The cached value type; System.Text.Json serializable.</typeparam>
    /// <param name="key">The versioned cache key; bump the version on shape changes.</param>
    /// <param name="load">Produces the value on a miss. An exception it throws propagates and nothing is cached.</param>
    /// <param name="tagsFor">The tags of a freshly loaded value (built with <see cref="CacheTags"/>).</param>
    /// <param name="duration">How long a freshly loaded entry lives, in memory and in Redis.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The cached or freshly loaded value.</returns>
    ValueTask<TValue> GetOrLoadAsync<TValue>(
        string key,
        Func<CancellationToken, Task<TValue>> load,
        Func<TValue, IReadOnlyCollection<string>> tagsFor,
        TimeSpan duration,
        CancellationToken cancellationToken);

    /// <summary>
    /// Expires every entry carrying any of <paramref name="tags"/>, in this process at once and in the other replicas
    /// through the backplane. Errors talking to Redis are logged, not thrown; the entry duration bounds staleness then.
    /// </summary>
    /// <param name="tags">The tags to remove (built with <see cref="CacheTags"/>); empty is a no-op.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A task that completes when the local removal is done and the notification is sent.</returns>
    ValueTask RemoveByTagsAsync(IReadOnlyCollection<string> tags, CancellationToken cancellationToken);
}
