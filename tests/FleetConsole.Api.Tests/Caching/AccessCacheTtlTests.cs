using System.Diagnostics;
using System.Net;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Api.Tests.Integration;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using FleetConsole.Api.Tests.Integration.Admin.Grants;
using FleetConsole.Api.Tests.Integration.Proxy;
using FleetConsole.Application.Abstractions.Caching;
using FleetConsole.Domain.Access;
using FleetConsole.Infrastructure.Caching;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Caching;

/// <summary>
/// CACHE-4: the entry duration is the backstop when an invalidation is lost (Redis down, a missed handler). With
/// invalidation suppressed by a test double and <c>Cache:Duration</c> = 1 s, a revoked grant is still served from the
/// stale snapshot at first and refused once the entry expires — without any further change.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class AccessCacheTtlTests(AccessCacheTtlTests.Host fixture) : IClassFixture<AccessCacheTtlTests.Host>
{
    private const string Pods = "/api/v1/namespaces/shop/pods";

    private readonly ApiFactory _host = fixture.Api;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Revoked_grant_heals_after_the_entry_expires_when_invalidation_is_lost()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", Pods, 200, new { kind = "PodList", items = Array.Empty<object>() });
        var username = _host.NewUsername();
        var (cluster, _) = await _host.Data.ProxyClusterAsync(server, username, AccessMode.ReadOnly);
        using var client = await ProxyTestClient.LoginAsync(_host, username);

        // Admin sign-in and the grant lookup happen before the warm-up, so only the revoke sits inside the 1 s window
        // the stale assertion below relies on.
        using var admin = await _host.AdminClientAsync();
        var grant = (await GrantsApi.UserGrantsAsync(admin, username)).Single();
        (await StatusAsync(client, cluster.Name)).ShouldBe(HttpStatusCode.OK);

        using (var revoke = await GrantsApi.RevokeAsync(admin, grant.GetProperty("id").GetGuid()))
        {
            revoke.IsSuccessStatusCode.ShouldBeTrue();
        }

        // Proves the double works: without the post-commit invalidation the snapshot is stale (within 1 s).
        (await StatusAsync(client, cluster.Name)).ShouldBe(HttpStatusCode.OK);

        var clock = Stopwatch.StartNew();
        var status = HttpStatusCode.OK;
        while (status == HttpStatusCode.OK && clock.Elapsed < TimeSpan.FromSeconds(10))
        {
            await Task.Delay(TimeSpan.FromMilliseconds(250), Ct);
            status = await StatusAsync(client, cluster.Name);
        }

        status.ShouldBe(HttpStatusCode.NotFound);
    }

    private static async Task<HttpStatusCode> StatusAsync(ProxyTestClient client, string cluster)
    {
        using var response = await client.SendAsync(HttpMethod.Get, cluster, Pods);
        return response.StatusCode;
    }

    /// <summary>The variant: 1 s entries, invalidation dropped.</summary>
    /// <param name="factory">The collection's default host, which creates the variant.</param>
    public sealed class Host(ApiFactory factory) : IAsyncLifetime
    {
        /// <summary>The variant.</summary>
        public ApiFactory Api { get; private set; } = null!;

        /// <inheritdoc />
        public async ValueTask InitializeAsync() =>
            Api = await factory.CreateVariantAsync(
                new Dictionary<string, string?> { ["Cache:Duration"] = "00:00:01" },
                configureServices: services => services.AddSingleton<IQueryCache>(
                    sp => new NoInvalidationCache(ActivatorUtilities.CreateInstance<FusionQueryCache>(sp))));

        /// <inheritdoc />
        public async ValueTask DisposeAsync() => await Api.DisposeAsync();
    }

    // Serves through the real cache but loses every invalidation, as when Redis or a handler fails.
    private sealed class NoInvalidationCache(IQueryCache inner) : IQueryCache
    {
        public ValueTask<TValue> GetOrLoadAsync<TValue>(
            string key, Func<CancellationToken, Task<TValue>> load, Func<TValue, IReadOnlyCollection<string>> tagsFor, CancellationToken cancellationToken) =>
            inner.GetOrLoadAsync(key, load, tagsFor, cancellationToken);

        public ValueTask RemoveByTagsAsync(IReadOnlyCollection<string> tags, CancellationToken cancellationToken) => ValueTask.CompletedTask;
    }
}
