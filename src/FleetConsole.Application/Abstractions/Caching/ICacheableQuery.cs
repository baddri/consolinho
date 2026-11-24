using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Abstractions.Caching;

/// <summary>
/// Marks a query whose successful result is cached by the <c>CachingBehavior</c> (pipeline step 5, ADR-0040 §3). The
/// query supplies its cache key and derives the entry's tags from the result, so invalidation can target everything a
/// result depends on.
/// </summary>
/// <remarks>
/// Implementing the interface is not enough: register the behavior for the query with
/// <c>services.AddCacheableQuery&lt;TQuery, TValue&gt;()</c> in <c>AddApplication</c>, because an open-generic behavior
/// can't map a <c>Result&lt;TValue&gt;</c> response back to <typeparamref name="TValue"/>. Failure results are never
/// cached.
/// </remarks>
/// <typeparam name="TValue">The value of a successful result; System.Text.Json serializable, no secrets in clear.</typeparam>
public interface ICacheableQuery<TValue> : IQuery<TValue>
{
    /// <summary>The versioned cache key of this query's result, e.g. <c>access:v1:user:{id}</c>.</summary>
    string CacheKey { get; }

    /// <summary>The tags of <paramref name="value"/> (built with <see cref="CacheTags"/>), set on its cache entry.</summary>
    /// <param name="value">A freshly loaded successful value.</param>
    /// <returns>The tags; may be empty.</returns>
    IReadOnlyCollection<string> TagsFor(TValue value);
}
