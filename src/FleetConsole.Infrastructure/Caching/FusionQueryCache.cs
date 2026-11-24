using FleetConsole.Application.Abstractions.Caching;
using ZiggyCreatures.Caching.Fusion;

namespace FleetConsole.Infrastructure.Caching;

/// <summary>
/// <see cref="IQueryCache"/> on FusionCache (ADR-0040 §2): L1 memory, plus Redis L2 and the Redis backplane when
/// <c>ConnectionStrings:redis</c> is set. The only class that touches <see cref="IFusionCache"/>; the entry options
/// (duration, fail-safe off, timeouts) are the cache's defaults, set once in <see cref="CachingSetup"/>; the duration
/// overload copies them and changes only the duration.
/// </summary>
/// <remarks>
/// Tags are <b>adaptive</b>: they are set on the factory context from the loaded value, so a query can tag its entry with
/// ids it only learns by loading (e.g. the clusters a user's grants point at).
/// </remarks>
/// <param name="cache">The configured FusionCache instance.</param>
internal sealed class FusionQueryCache(IFusionCache cache) : IQueryCache
{
    /// <inheritdoc />
    public ValueTask<TValue> GetOrLoadAsync<TValue>(
        string key,
        Func<CancellationToken, Task<TValue>> load,
        Func<TValue, IReadOnlyCollection<string>> tagsFor,
        CancellationToken cancellationToken) =>
        GetOrLoadAsync(key, load, tagsFor, options: null, cancellationToken);

    /// <inheritdoc />
    public ValueTask<TValue> GetOrLoadAsync<TValue>(
        string key,
        Func<CancellationToken, Task<TValue>> load,
        Func<TValue, IReadOnlyCollection<string>> tagsFor,
        TimeSpan duration,
        CancellationToken cancellationToken)
    {
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(duration, TimeSpan.Zero);

        // A copy of the defaults (fail-safe off, timeouts) with only the duration changed.
        return GetOrLoadAsync(key, load, tagsFor, cache.CreateEntryOptions(duration: duration), cancellationToken);
    }

    private ValueTask<TValue> GetOrLoadAsync<TValue>(
        string key,
        Func<CancellationToken, Task<TValue>> load,
        Func<TValue, IReadOnlyCollection<string>> tagsFor,
        FusionCacheEntryOptions? options,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        ArgumentNullException.ThrowIfNull(load);
        ArgumentNullException.ThrowIfNull(tagsFor);

        // Null options = the cache's DefaultEntryOptions.
        return cache.GetOrSetAsync<TValue>(
            key,
            async (context, ct) =>
            {
                var value = await load(ct).ConfigureAwait(false);
                context.Tags = [.. tagsFor(value)];
                return value;
            },
            options: options,
            token: cancellationToken);
    }

    /// <inheritdoc />
    public ValueTask RemoveByTagsAsync(IReadOnlyCollection<string> tags, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(tags);
        return tags.Count == 0 ? ValueTask.CompletedTask : cache.RemoveByTagAsync(tags, token: cancellationToken);
    }
}
