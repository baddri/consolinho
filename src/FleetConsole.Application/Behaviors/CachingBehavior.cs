using FleetConsole.Application.Abstractions.Caching;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Behaviors;

/// <summary>
/// Pipeline step 5 (after validation, before the handler): serves an <see cref="ICacheableQuery{TValue}"/> from
/// <see cref="IQueryCache"/>, running the rest of the pipeline only on a miss. Only successful results are cached; a
/// failure result is returned to the caller uncached, so an error is never replayed from the cache (ADR-0040 §3).
/// </summary>
/// <remarks>
/// Registered <b>closed</b>, once per cacheable query, by <c>AddCacheableQuery&lt;TQuery, TValue&gt;()</c>: as an
/// open generic the container could not bind <typeparamref name="TValue"/> from the <c>Result&lt;TValue&gt;</c>
/// response. The registration helper places it right after <c>ValidationBehavior</c>.
/// </remarks>
/// <typeparam name="TQuery">The cacheable query.</typeparam>
/// <typeparam name="TValue">The value of a successful result.</typeparam>
/// <param name="cache">The query cache port.</param>
internal sealed class CachingBehavior<TQuery, TValue>(IQueryCache cache) : IPipelineBehavior<TQuery, Result<TValue>>
    where TQuery : ICacheableQuery<TValue>
{
    /// <inheritdoc />
    public async Task<Result<TValue>> Handle(TQuery request, RequestHandlerDelegate<Result<TValue>> next, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(next);

        try
        {
            return await cache.GetOrLoadAsync(
                request.CacheKey,
                async ct =>
                {
                    var result = await next(ct).ConfigureAwait(false);
                    // The cache stores whatever the loader returns; throwing is the only way to hand a failure back
                    // through it without storing anything. Caught right below.
                    return result.IsSuccess ? result.Value : throw new UncachedFailure(result);
                },
                request.TagsFor,
                cancellationToken).ConfigureAwait(false);
        }
        catch (UncachedFailure failure)
        {
            return failure.Result;
        }
    }

    /// <summary>Carries a failure result out of the cache loader so it is returned, not cached. Never escapes.</summary>
    /// <param name="result">The failed result.</param>
    private sealed class UncachedFailure(Result<TValue> result) : Exception("A failure result is not cached.")
    {
        /// <summary>The failed result to return to the caller.</summary>
        public Result<TValue> Result { get; } = result;
    }
}
