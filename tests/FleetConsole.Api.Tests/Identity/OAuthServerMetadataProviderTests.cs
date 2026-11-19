using FleetConsole.Api.Tests.DevOAuth;
using FleetConsole.Application.Auth;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace FleetConsole.Api.Tests.Identity;

/// <summary>
/// <c>OAuthServerMetadataProvider</c> and its warm-up (ADR-0010): discovery against the emulator, unreachable host →
/// null then recovery after the 10 s retry window (manual clock), static override without discovery.
/// </summary>
public sealed class OAuthServerMetadataProviderTests : IAsyncLifetime
{
    private readonly DevOAuthFactory _devOAuth = new();
    private readonly CapturedLogs _logs = new();
    private readonly ManualClock _clock = new();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public ValueTask InitializeAsync() => ValueTask.CompletedTask;

    public async ValueTask DisposeAsync() => await _devOAuth.DisposeAsync();

    [Fact]
    public async Task Discovery_LoadsEndpointsFromTheEmulator_AndCachesThem()
    {
        var handler = new SwitchableHandler(() => _devOAuth.Server.CreateHandler());
        using var host = IdentityTestHost.Build(IdentityTestHost.DevConfiguration(), () => handler, clock: _clock);
        var provider = host.Services.GetRequiredService<IOAuthServerMetadataProvider>();

        provider.Current.ShouldBeNull();
        var metadata = await provider.GetAsync(Ct);
        var again = await provider.GetAsync(Ct);

        metadata.ShouldBe(new OAuthServerMetadata(new Uri("http://localhost/oauth/authorize"), new Uri("http://localhost/oauth/token")));
        again.ShouldBeSameAs(metadata);
        provider.Current.ShouldBeSameAs(metadata);
        handler.Calls.ShouldBe(1, "a successful load is cached");
    }

    [Fact]
    public async Task UnreachableHost_ReturnsNull_ThenRecoversAfterTheRetryWindow()
    {
        var handler = new SwitchableHandler(() => _devOAuth.Server.CreateHandler()) { Down = true };
        using var host = IdentityTestHost.Build(IdentityTestHost.DevConfiguration(), () => handler, logs: _logs, clock: _clock);
        var provider = host.Services.GetRequiredService<IOAuthServerMetadataProvider>();

        (await provider.GetAsync(Ct)).ShouldBeNull();
        _logs.Entries.ShouldContain(e => e.EventId == 3310 && e.Level == Microsoft.Extensions.Logging.LogLevel.Warning);
        _logs.AllText.ShouldNotContain(DevOAuthFlow.ClientSecret);

        // Host back up, but still inside the window: no new attempt.
        handler.Down = false;
        _clock.Advance(TimeSpan.FromSeconds(9));
        (await provider.GetAsync(Ct)).ShouldBeNull();
        handler.Calls.ShouldBe(1);

        _clock.Advance(TimeSpan.FromSeconds(2));
        (await provider.GetAsync(Ct)).ShouldNotBeNull().TokenEndpoint.ShouldBe(new Uri("http://localhost/oauth/token"));
        handler.Calls.ShouldBe(2);
    }

    [Fact]
    public async Task HttpsHost_RejectsDiscoveredHttpEndpoints()
    {
        const string Document = """
            {"authorization_endpoint":"https://oauth.example.test/oauth/authorize","token_endpoint":"http://oauth.example.test/oauth/token"}
            """;
        var handler = new StubHandler(_ => new HttpResponseMessage(System.Net.HttpStatusCode.OK)
        {
            Content = new StringContent(Document, System.Text.Encoding.UTF8, "application/json"),
        });
        using var host = IdentityTestHost.Build(
            IdentityTestHost.DevConfiguration("https://api.host.example.test:6443"), () => handler,
            environment: "Production", logs: _logs, clock: _clock);

        (await host.Services.GetRequiredService<IOAuthServerMetadataProvider>().GetAsync(Ct)).ShouldBeNull();

        handler.Requests.ShouldHaveSingleItem().ShouldBe(new Uri("https://api.host.example.test:6443/.well-known/oauth-authorization-server"));
        _logs.Entries.ShouldContain(e => e.EventId == 3310 && e.Text.Contains("without https endpoints", StringComparison.Ordinal));
    }

    [Fact]
    public async Task StaticOverride_BypassesDiscovery()
    {
        var handler = new SwitchableHandler { Down = true };
        var configuration = IdentityTestHost.DevConfiguration();
        configuration["Auth:OpenShift:AuthorizationEndpoint"] = "https://oauth.example.test/oauth/authorize";
        configuration["Auth:OpenShift:TokenEndpoint"] = "https://oauth.example.test/oauth/token";
        using var host = IdentityTestHost.Build(configuration, () => handler, clock: _clock);
        var provider = host.Services.GetRequiredService<IOAuthServerMetadataProvider>();

        var expected = new OAuthServerMetadata(new Uri("https://oauth.example.test/oauth/authorize"), new Uri("https://oauth.example.test/oauth/token"));
        provider.Current.ShouldBe(expected);
        (await provider.GetAsync(Ct)).ShouldBe(expected);
        handler.Calls.ShouldBe(0);
    }

    [Fact]
    public async Task WarmUp_LoadsInTheBackground_WithoutBlockingStartup()
    {
        using var release = new SemaphoreSlim(0);
        var handler = new BlockingHandler(release, () => _devOAuth.Server.CreateHandler());
        using var host = IdentityTestHost.Build(IdentityTestHost.DevConfiguration(), () => handler, clock: _clock);
        var provider = host.Services.GetRequiredService<IOAuthServerMetadataProvider>();

        await host.StartAsync(Ct).WaitAsync(TimeSpan.FromSeconds(5), Ct);
        provider.Current.ShouldBeNull("discovery is still blocked; startup did not wait for it");

        release.Release();
        // The warm-up publishes Current when its load completes; poll for it (bounded).
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (provider.Current is null && DateTime.UtcNow < deadline)
        {
            await Task.Delay(20, Ct);
        }

        provider.Current.ShouldNotBeNull();
        await host.StopAsync(Ct);
    }

    /// <summary>Answers every request with <c>respond</c> and records the URLs.</summary>
    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<Uri?> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request.RequestUri);
            return Task.FromResult(respond(request));
        }
    }

    /// <summary>Holds every request until the test releases it, then forwards to the emulator.</summary>
    private sealed class BlockingHandler(SemaphoreSlim release, Func<HttpMessageHandler> inner) : DelegatingHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            await release.WaitAsync(cancellationToken);
            InnerHandler ??= inner();
            return await base.SendAsync(request, cancellationToken);
        }
    }
}
