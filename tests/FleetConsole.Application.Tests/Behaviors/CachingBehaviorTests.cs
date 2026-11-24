using FleetConsole.Application.Abstractions.Caching;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Behaviors;
using FleetConsole.Domain.Common;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Application.Tests.Behaviors;

public sealed class CachingBehaviorTests
{
    private static readonly CancellationToken Ct = TestContext.Current.CancellationToken;

    [Fact]
    public async Task Success_IsLoadedOnce_ThenServedFromTheCache()
    {
        var cache = new FakeQueryCache();
        await using var provider = Build(cache);

        var first = await SendAsync(provider, new CachedEchoQuery("a"));
        var second = await SendAsync(provider, new CachedEchoQuery("a"));

        first.Value.ShouldBe("a");
        second.Value.ShouldBe("a");
        provider.GetRequiredService<CallLog>().Entries.Count(e => e == "handler:a").ShouldBe(1);
        cache.Keys.ShouldBe(["echo:a"]);
    }

    [Fact]
    public async Task Failure_IsNeverCached()
    {
        var cache = new FakeQueryCache();
        await using var provider = Build(cache);

        var first = await SendAsync(provider, new CachedEchoQuery("missing"));
        var second = await SendAsync(provider, new CachedEchoQuery("missing"));

        first.IsFailure.ShouldBeTrue();
        second.Error.ShouldBe(first.Error);
        provider.GetRequiredService<CallLog>().Entries.Count(e => e == "handler:missing").ShouldBe(2);
        cache.Keys.ShouldBeEmpty();
    }

    [Fact]
    public async Task Tags_ComeFromTheLoadedValue()
    {
        var cache = new FakeQueryCache();
        await using var provider = Build(cache);

        await SendAsync(provider, new CachedEchoQuery("b"));

        cache.Tags["echo:b"].ShouldBe(["value:b"]);
    }

    [Fact]
    public async Task InvalidQuery_IsRejectedBeforeTheCache()
    {
        var cache = new FakeQueryCache();
        await using var provider = Build(cache);

        var result = await SendAsync(provider, new CachedEchoQuery(""));

        result.IsFailure.ShouldBeTrue();
        provider.GetRequiredService<CallLog>().Entries.ShouldNotContain("cache");
    }

    [Fact]
    public async Task CacheableQuery_RunsCachingAtStep5_DirectlyAfterValidation()
    {
        await using var provider = Build(new FakeQueryCache());
        await using var scope = provider.CreateAsyncScope();

        var behaviors = scope.ServiceProvider.GetServices<IPipelineBehavior<CachedEchoQuery, Result<string>>>()
            .Select(b => b.GetType().GetGenericTypeDefinition())
            .ToList();

        // Authorization, read-only guard and unit of work are constrained to other request kinds, so a plain query's
        // pipeline is logging, validation, caching, then everything registered after (here ThirdBehavior).
        behaviors.ShouldBe(
        [
            typeof(LoggingBehavior<,>),
            typeof(ValidationBehavior<,>),
            typeof(CachingBehavior<,>),
            typeof(ThirdBehavior<,>),
        ]);
    }

    [Fact]
    public async Task CacheHit_SkipsTheRestOfThePipeline()
    {
        var cache = new FakeQueryCache();
        await using var provider = Build(cache);
        await SendAsync(provider, new CachedEchoQuery("c"));
        var log = provider.GetRequiredService<CallLog>();
        log.Entries.Clear();

        await SendAsync(provider, new CachedEchoQuery("c"));

        // The cache ran; the behavior registered after it and the handler did not.
        log.Entries.ShouldBe(["cache"]);
    }

    [Fact]
    public void AddCacheableQuery_WithoutTheApplicationPipeline_Throws()
    {
        var services = new ServiceCollection();

        Should.Throw<InvalidOperationException>(() => services.AddCacheableQuery<CachedEchoQuery, string>());
    }

    private static ServiceProvider Build(FakeQueryCache cache) => ServiceProviderBuilder.Build(services =>
    {
        services.AddSingleton<IQueryCache>(sp => cache.WithLog(sp.GetRequiredService<CallLog>()));
        // An open-generic behavior registered last, to show the closed caching step still lands right after validation.
        services.AddScoped(typeof(IPipelineBehavior<,>), typeof(ThirdBehavior<,>));
        services.AddCacheableQuery<CachedEchoQuery, string>();
    });

    private static async Task<Result<string>> SendAsync(ServiceProvider provider, CachedEchoQuery query)
    {
        await using var scope = provider.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(query, Ct);
    }
}

/// <summary>A cacheable query whose handler fails for "missing" and whose validator rejects empty text.</summary>
public sealed record CachedEchoQuery(string Text) : ICacheableQuery<string>
{
    public string CacheKey => $"echo:{Text}";

    public IReadOnlyCollection<string> TagsFor(string value) => [$"value:{value}"];
}

internal sealed class CachedEchoQueryHandler(CallLog log) : IRequestHandler<CachedEchoQuery, Result<string>>
{
    public Task<Result<string>> Handle(CachedEchoQuery request, CancellationToken cancellationToken)
    {
        log.Entries.Add($"handler:{request.Text}");
        return Task.FromResult(request.Text == "missing"
            ? Result.Failure<string>(Error.NotFound("echo.not_found", "No such echo."))
            : Result.Success(request.Text));
    }
}

internal sealed class CachedEchoQueryValidator : AbstractValidator<CachedEchoQuery>
{
    public CachedEchoQueryValidator() => RuleFor(q => q.Text).NotEmpty();
}

/// <summary>In-memory <see cref="IQueryCache"/> that records keys, tags and each call ("cache") in the <see cref="CallLog"/>.</summary>
internal sealed class FakeQueryCache : IQueryCache
{
    private readonly Dictionary<string, object?> _values = [];
    private CallLog? _log;

    public IReadOnlyCollection<string> Keys => _values.Keys;

    public Dictionary<string, IReadOnlyCollection<string>> Tags { get; } = [];

    public FakeQueryCache WithLog(CallLog log)
    {
        _log = log;
        return this;
    }

    public async ValueTask<TValue> GetOrLoadAsync<TValue>(
        string key,
        Func<CancellationToken, Task<TValue>> load,
        Func<TValue, IReadOnlyCollection<string>> tagsFor,
        CancellationToken cancellationToken)
    {
        _log?.Entries.Add("cache");
        if (_values.TryGetValue(key, out var cached))
        {
            return (TValue)cached!;
        }

        // Like FusionCache: a throwing load stores nothing.
        var value = await load(cancellationToken);
        _values[key] = value;
        Tags[key] = tagsFor(value);
        return value;
    }

    public ValueTask RemoveByTagsAsync(IReadOnlyCollection<string> tags, CancellationToken cancellationToken) =>
        ValueTask.CompletedTask;
}
