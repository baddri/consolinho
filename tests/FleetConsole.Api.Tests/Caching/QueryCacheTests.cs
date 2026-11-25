using System.Net;
using FleetConsole.Api.Tests.Identity;
using FleetConsole.Api.Tests.Integration;
using FleetConsole.Api.Tests.Integration.Hosting;
using FleetConsole.Application.Abstractions.Caching;
using FleetConsole.Infrastructure;
using FleetConsole.Infrastructure.Caching;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Api.Tests.Caching;

/// <summary>
/// The FusionCache adapter against a real Redis (ADR-0040 §2, §6, §7): L2 sharing and backplane invalidation between
/// two instances (two "pods"), fail-safe off (CACHE-5), and a dead Redis degrading to L1 + database (CACHE-7). Each
/// instance is a minimal host running only <c>AddQueryCache</c>; keys and tags are unique per test because the Redis
/// is shared.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class QueryCacheTests(ApiFactory factory)
{
    /// <summary>A port nothing listens on, with a fake password that must never reach a log line or probe body.</summary>
    private const string UnreachableRedis = "127.0.0.1:1,password=fake-redis-password-not-a-secret";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Value_RoundTripsThroughRedis_ToASecondInstance()
    {
        using var podA = CacheHost(factory.Redis.ConnectionString);
        using var podB = CacheHost(factory.Redis.ConnectionString);
        var key = NewKey();

        await Cache(podA).GetOrLoadAsync(key, _ => Task.FromResult(new Payload("from-a", 1)), _ => [], Ct);
        var seenByB = await Cache(podB).GetOrLoadAsync<Payload>(key, _ => throw new InvalidOperationException("B must read L2"), _ => [], Ct);

        seenByB.ShouldBe(new Payload("from-a", 1));
    }

    [Fact]
    public async Task RemoveByTags_OnOneInstance_MakesTheOtherReload()
    {
        using var podA = CacheHost(factory.Redis.ConnectionString);
        using var podB = CacheHost(factory.Redis.ConnectionString);
        var key = NewKey();
        var tag = $"user:{Guid.NewGuid():D}";
        var loadsOnB = 0;
        Task<int> LoadOnB(CancellationToken _) => Task.FromResult(Interlocked.Increment(ref loadsOnB));

        (await Cache(podB).GetOrLoadAsync(key, LoadOnB, _ => [tag], Ct)).ShouldBe(1);
        (await Cache(podB).GetOrLoadAsync(key, LoadOnB, _ => [tag], Ct)).ShouldBe(1); // B now serves from its L1

        // The backplane subscription is set up in the background on first use: repeat the removal until B sees it.
        var deadline = DateTimeOffset.UtcNow.AddSeconds(15);
        var value = 1;
        while (value == 1 && DateTimeOffset.UtcNow < deadline)
        {
            await Cache(podA).RemoveByTagsAsync([tag], Ct);
            await Task.Delay(TimeSpan.FromMilliseconds(100), Ct);
            value = await Cache(podB).GetOrLoadAsync(key, LoadOnB, _ => [tag], Ct);
        }

        value.ShouldBe(2);
    }

    [Fact]
    public async Task ExpiredEntry_WithFailingLoad_Throws_InsteadOfServingStale()
    {
        using var pod = CacheHost(factory.Redis.ConnectionString, duration: "00:00:01");
        var key = NewKey();
        await Cache(pod).GetOrLoadAsync(key, _ => Task.FromResult("fresh"), _ => [], Ct);

        await Task.Delay(TimeSpan.FromMilliseconds(1500), Ct);

        var exception = await Should.ThrowAsync<InvalidOperationException>(async () =>
            await Cache(pod).GetOrLoadAsync<string>(key, _ => throw new InvalidOperationException("database down"), _ => [], Ct));
        exception.Message.ShouldBe("database down");
    }

    [Fact]
    public async Task DurationOverload_ExpiresTheEntryAfterTheGivenDuration_NotTheDefault()
    {
        // Default 30 s; the per-call duration (Fleet:CacheDuration, ADR-0041 §3) must win in L1 and in Redis.
        using var pod = CacheHost(factory.Redis.ConnectionString);
        var key = NewKey();
        var loads = 0;
        Task<int> Load(CancellationToken _) => Task.FromResult(Interlocked.Increment(ref loads));
        var duration = TimeSpan.FromSeconds(1);

        (await Cache(pod).GetOrLoadAsync(key, Load, _ => [], duration, Ct)).ShouldBe(1);
        (await Cache(pod).GetOrLoadAsync(key, Load, _ => [], duration, Ct)).ShouldBe(1);

        await Task.Delay(TimeSpan.FromMilliseconds(1500), Ct);

        // Gone from L1 and from Redis (with the 30 s default either would still serve 1).
        (await Cache(pod).GetOrLoadAsync(key, Load, _ => [], duration, Ct)).ShouldBe(2);
    }

    [Fact]
    public async Task RedisDown_StillLoads_ServesFromL1_LogsAWarning_AndReportsDegraded()
    {
        var logs = new CapturedLogs();
        using var pod = CacheHost(UnreachableRedis, logs);
        var key = NewKey();
        var loads = 0;
        Task<string> Load(CancellationToken _) => Task.FromResult($"value-{Interlocked.Increment(ref loads)}");

        var first = await Cache(pod).GetOrLoadAsync(key, Load, _ => ["cluster:x"], Ct);
        var second = await Cache(pod).GetOrLoadAsync(key, Load, _ => ["cluster:x"], Ct);
        var report = await pod.Services.GetRequiredService<HealthCheckService>().CheckHealthAsync(Ct);

        first.ShouldBe("value-1");
        second.ShouldBe("value-1");
        loads.ShouldBe(1);
        logs.Entries.ShouldContain(entry => entry.Level == LogLevel.Warning);
        report.Entries[DependencyInjection.RedisHealthCheckName].Status.ShouldBe(HealthStatus.Degraded);
        report.Status.ShouldBe(HealthStatus.Degraded);
        logs.AllText.ShouldNotContain("fake-redis-password-not-a-secret");
        report.Entries[DependencyInjection.RedisHealthCheckName].Description!.ShouldNotContain("fake-redis-password-not-a-secret");
    }

    [Fact]
    public async Task RedisDown_HealthProbe_Answers200Degraded()
    {
        await using var host = ProductionHost.Create(factory, new Dictionary<string, string?> { ["ConnectionStrings:redis"] = UnreachableRedis });
        using var client = host.CreateClient();

        using var response = await Readiness.GetWhenReadyAsync(client, "/health", Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var body = await response.Content.ReadAsStringAsync(Ct);
        body.ShouldBe("Degraded");
    }

    private static string NewKey() => $"test:{Guid.NewGuid():N}";

    private static IQueryCache Cache(IHost host) => host.Services.GetRequiredService<IQueryCache>();

    /// <summary>A minimal Production host with only the query cache: one "pod" with its own L1.</summary>
    private static IHost CacheHost(string redisConnectionString, CapturedLogs? logs = null, string duration = "00:00:30")
    {
        var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
        {
            EnvironmentName = Environments.Production,
            DisableDefaults = true,
        });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:redis"] = redisConnectionString,
            ["Cache:Duration"] = duration,
        });
        if (logs is not null)
        {
            builder.Logging.AddProvider(logs).SetMinimumLevel(LogLevel.Debug);
        }

        builder.AddQueryCache();
        return builder.Build();
    }

    /// <summary>A small record to prove values survive the JSON round trip through Redis.</summary>
    public sealed record Payload(string Name, int Count);
}
