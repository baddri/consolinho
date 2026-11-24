using FleetConsole.Application.Abstractions.Caching;
using Microsoft.Extensions.Caching.StackExchangeRedis;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ZiggyCreatures.Caching.Fusion;
using ZiggyCreatures.Caching.Fusion.Backplane.StackExchangeRedis;
using ZiggyCreatures.Caching.Fusion.Serialization.SystemTextJson;

namespace FleetConsole.Infrastructure.Caching;

/// <summary>
/// Registers the query cache (ADR-0040 §2, §6, §7): <see cref="IQueryCache"/> on FusionCache, with Redis as L2 and
/// backplane when <c>ConnectionStrings:redis</c> is set, the <c>redis</c> health check, and the start-time validation
/// of <c>Cache:Duration</c> and of the connection string (required outside Development).
/// </summary>
internal static class CachingSetup
{
    /// <summary>
    /// Prefix of every key in L1 and Redis, so the console's entries are recognisable (and don't collide) in a shared
    /// Redis. The cache itself is FusionCache's default instance, whose name can't be changed through DI.
    /// </summary>
    public const string KeyPrefix = "fleetconsole:";

    /// <summary>
    /// How long FusionCache stops calling a failing Redis (L2 or backplane) before trying again, so a dead Redis costs
    /// one fast failure per window instead of one per request (ADR-0040 §6).
    /// </summary>
    public static readonly TimeSpan CircuitBreakerDuration = TimeSpan.FromSeconds(5);

    /// <summary>
    /// Upper bound of one Redis (L2) operation; a hanging Redis then costs at most this much before the request falls
    /// back to the database. Not a factory timeout: loads from the database are never cut short.
    /// </summary>
    public static readonly TimeSpan DistributedCacheTimeout = TimeSpan.FromSeconds(1);

    /// <summary>Adds the query cache to <paramref name="builder"/>.</summary>
    /// <remarks>
    /// Whether a connection string is set decides the shape of the cache (L1-only vs. L1 + L2 + backplane); see
    /// <see cref="AddRedisLayers"/>. Entry defaults: <c>Cache:Duration</c>, fail-safe <b>off</b> (an expired entry plus a
    /// failing load is an error, never a stale answer — CACHE-5), no factory timeouts, no eager refresh, and a corrupt
    /// L2 entry is treated as a miss (<c>ReThrowSerializationExceptions = false</c>). L2 and backplane errors are logged
    /// at Warning and never thrown. Nothing here logs the connection string: it carries the Redis password.
    /// </remarks>
    /// <param name="builder">The host builder.</param>
    /// <returns>The same builder, for chaining.</returns>
    public static IHostApplicationBuilder AddQueryCache(this IHostApplicationBuilder builder)
    {
        builder.Services.AddOptions<CacheOptions>()
            .BindConfiguration(CacheOptions.SectionName)
            .Validate(options => options.IsValid(), CacheOptions.InvalidDurationMessage)
            .ValidateOnStart();

        builder.Services.AddOptions<RedisConnectionOptions>()
            .Configure<IConfiguration, IHostEnvironment>((options, configuration, environment) =>
            {
                options.ConnectionString = configuration.GetConnectionString(RedisConnectionOptions.ConnectionName);
                options.IsDevelopment = environment.IsDevelopment();
            })
            .Validate(options => options.IsValid(), RedisConnectionOptions.MissingMessage)
            .ValidateOnStart();

        builder.Services.AddFusionCache()
            .WithOptions(options =>
            {
                options.DistributedCacheCircuitBreakerDuration = CircuitBreakerDuration;
                options.BackplaneCircuitBreakerDuration = CircuitBreakerDuration;
                options.DistributedCacheErrorsLogLevel = LogLevel.Warning;
                options.BackplaneErrorsLogLevel = LogLevel.Warning;
                options.DistributedCacheSyntheticTimeoutsLogLevel = LogLevel.Warning;
                options.SerializationErrorsLogLevel = LogLevel.Warning;
            })
            .WithCacheKeyPrefix(KeyPrefix)
            .WithPostSetup((services, cache) =>
            {
                ApplyEntryDefaults(cache.DefaultEntryOptions, services.GetRequiredService<IOptions<CacheOptions>>().Value);
                AddRedisLayers(services, cache);
            });

        // One multiplexer for L2, backplane and health check; the container disposes it on shutdown. The check is always
        // registered and reports Healthy when no Redis is configured (Development only, see the validation above).
        builder.Services.AddSingleton<RedisConnection>();
        // failureStatus Degraded: an exception the check doesn't catch itself (e.g. a malformed connection string) must not
        // turn into Unhealthy either (CACHE-7).
        builder.Services.AddHealthChecks()
            .AddCheck<RedisHealthCheck>(DependencyInjection.RedisHealthCheckName, failureStatus: HealthStatus.Degraded);

        builder.Services.AddSingleton<IQueryCache, FusionQueryCache>();
        return builder;
    }

    /// <summary>
    /// Adds Redis as L2 and backplane when a connection string is configured. Decided when the cache is first built, from
    /// the options, not at registration: the connection string can come from a configuration source added after the
    /// services are registered (e.g. a test host's overrides).
    /// </summary>
    /// <param name="services">The root service provider.</param>
    /// <param name="cache">The cache being set up.</param>
    private static void AddRedisLayers(IServiceProvider services, IFusionCache cache)
    {
        var connection = services.GetRequiredService<RedisConnection>();
        if (!connection.IsConfigured)
        {
            return;
        }

        cache.SetupDistributedCache(
            new RedisCache(Options.Create(new RedisCacheOptions { ConnectionMultiplexerFactory = connection.GetAsync })),
            new FusionCacheSystemTextJsonSerializer());
        cache.SetupBackplane(new RedisBackplane(
            new RedisBackplaneOptions { ConnectionMultiplexerFactory = connection.GetAsync },
            services.GetService<ILogger<RedisBackplane>>()));
    }

    /// <summary>The entry defaults of ADR-0040 §6, set explicitly so a library default change can't turn them on.</summary>
    /// <param name="entry">The cache's default entry options.</param>
    /// <param name="options">The bound cache options.</param>
    internal static void ApplyEntryDefaults(FusionCacheEntryOptions entry, CacheOptions options)
    {
        entry.Duration = options.Duration;
        entry.IsFailSafeEnabled = false;
        entry.FactorySoftTimeout = Timeout.InfiniteTimeSpan;
        entry.FactoryHardTimeout = Timeout.InfiniteTimeSpan;
        entry.EagerRefreshThreshold = null;
        entry.ReThrowSerializationExceptions = false;
        entry.DistributedCacheHardTimeout = DistributedCacheTimeout;
    }
}
