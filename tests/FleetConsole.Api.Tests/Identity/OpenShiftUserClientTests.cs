using System.Net;
using System.Net.Sockets;
using FleetConsole.Api.Tests.DevOAuth;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Auth;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace FleetConsole.Api.Tests.Identity;

/// <summary>
/// <c>OpenShiftUserClient</c> against the in-process DevOAuth emulator (T-0009): <c>users/~</c> mapping, 401 and
/// unreachable host → <see cref="ExternalIdentityUnavailableException"/>, CA bundle trust, and the access token never
/// reaching logs or exception messages (AUTH-3 groundwork).
/// </summary>
public sealed class OpenShiftUserClientTests : IAsyncLifetime
{
    private static readonly string[] SreGroup = ["sre"];

    private readonly DevOAuthFactory _devOAuth = new();
    private readonly CapturedLogs _logs = new();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public ValueTask InitializeAsync() => ValueTask.CompletedTask;

    public async ValueTask DisposeAsync() => await _devOAuth.DisposeAsync();

    private IHost EmulatorHost() =>
        IdentityTestHost.Build(IdentityTestHost.DevConfiguration(), () => _devOAuth.Server.CreateHandler(), logs: _logs);

    private async Task<string> TokenForAsync(string user)
    {
        using var browser = _devOAuth.CreateNonRedirectingClient();
        return await DevOAuthFlow.GetAccessTokenAsync(browser, user);
    }

    [Fact]
    public async Task UsersTilde_MapsNameFullNameAndGroups_Unfiltered()
    {
        var token = await TokenForAsync("alice");
        using var host = EmulatorHost();

        var identity = await host.Services.GetRequiredService<IExternalIdentityClient>()
            .GetCurrentUserAsync(new SensitiveString(token), Ct);

        identity.Username.ShouldBe("alice");
        identity.FullName.ShouldBe("Alice Example");
        identity.Groups.ShouldBe(["sre", "system:authenticated", "system:authenticated:oauth"],
            "the adapter reports what OpenShift says; the login use case filters virtual groups");
        _logs.AllText.ShouldNotContain(token);
    }

    [Fact]
    public async Task UsersTilde_WithoutFullName_MapsNull()
    {
        var token = await TokenForAsync("bob");
        using var host = EmulatorHost();

        var identity = await host.Services.GetRequiredService<IExternalIdentityClient>()
            .GetCurrentUserAsync(new SensitiveString(token), Ct);

        identity.ShouldBe(new ExternalIdentity("bob", null, identity.Groups));
        identity.Groups.ShouldBe(["system:authenticated", "system:authenticated:oauth"]);
    }

    [Fact]
    public async Task UnknownToken_Is401_ThrowsUnavailable_WithoutLeakingTheToken()
    {
        const string Token = "sha256~fake-token-T0014-do-not-leak";
        using var host = EmulatorHost();

        var exception = await Should.ThrowAsync<ExternalIdentityUnavailableException>(() =>
            host.Services.GetRequiredService<IExternalIdentityClient>().GetCurrentUserAsync(new SensitiveString(Token), Ct));

        exception.Message.ShouldContain("401");
        exception.ToString().ShouldNotContain(Token);
        _logs.Entries.ShouldContain(e => e.EventId == 3301);
        _logs.AllText.ShouldNotContain(Token);
    }

    [Fact]
    public async Task UnreachableHost_ThrowsUnavailable()
    {
        using var host = IdentityTestHost.Build(IdentityTestHost.DevConfiguration($"http://127.0.0.1:{UnusedPort()}"), logs: _logs);

        var exception = await Should.ThrowAsync<ExternalIdentityUnavailableException>(() =>
            host.Services.GetRequiredService<IExternalIdentityClient>()
                .GetCurrentUserAsync(new SensitiveString("sha256~fake-unreachable-token"), Ct));

        exception.InnerException.ShouldBeOfType<HttpRequestException>();
        _logs.Entries.ShouldContain(e => e.EventId == 3300);
        _logs.AllText.ShouldNotContain("sha256~fake-unreachable-token");
    }

    [Fact]
    public async Task ServerError_ThrowsUnavailable_OtherStatus_ThrowsInvalidOperation()
    {
        var handler = new SwitchableHandler { Status = HttpStatusCode.ServiceUnavailable };
        using var host = IdentityTestHost.Build(IdentityTestHost.DevConfiguration(), () => handler);
        var client = host.Services.GetRequiredService<IExternalIdentityClient>();

        await Should.ThrowAsync<ExternalIdentityUnavailableException>(() => client.GetCurrentUserAsync(new SensitiveString("t"), Ct));

        handler.Status = HttpStatusCode.Forbidden;
        await Should.ThrowAsync<InvalidOperationException>(() => client.GetCurrentUserAsync(new SensitiveString("t"), Ct));
    }

    [Fact]
    public async Task BodyReadFailure_IsUnavailable()
    {
        using var host = IdentityTestHost.Build(IdentityTestHost.DevConfiguration(), () => new BrokenBodyHandler());

        var exception = await Should.ThrowAsync<ExternalIdentityUnavailableException>(() =>
            host.Services.GetRequiredService<IExternalIdentityClient>().GetCurrentUserAsync(new SensitiveString("t"), Ct));

        exception.InnerException.ShouldBeOfType<HttpRequestException>();
    }

    [Fact]
    public async Task CaBundle_IsTrusted_AndSystemTrustRejectsTheSelfSignedServer()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", "/apis/user.openshift.io/v1/users/~", 200, new { metadata = new { name = "alice" }, groups = SreGroup });
        var caFile = Path.Combine(Path.GetTempPath(), $"fleetconsole-t0014-{Guid.NewGuid():N}.pem");
        await File.WriteAllTextAsync(caFile, server.CaBundlePem, Ct);
        try
        {
            var trusted = IdentityTestHost.DevConfiguration(server.BaseAddress.AbsoluteUri);
            trusted["Auth:OpenShift:CaBundlePath"] = caFile;
            using (var host = IdentityTestHost.Build(trusted))
            {
                var identity = await host.Services.GetRequiredService<IExternalIdentityClient>()
                    .GetCurrentUserAsync(new SensitiveString("sha256~fake-ca-token"), Ct);
                identity.ShouldBe(new ExternalIdentity("alice", null, identity.Groups));
                server.Requests.ShouldHaveSingleItem().Authorization.ShouldBe("Bearer sha256~fake-ca-token");
            }

            using (var host = IdentityTestHost.Build(IdentityTestHost.DevConfiguration(server.BaseAddress.AbsoluteUri)))
            {
                var exception = await Should.ThrowAsync<ExternalIdentityUnavailableException>(() =>
                    host.Services.GetRequiredService<IExternalIdentityClient>()
                        .GetCurrentUserAsync(new SensitiveString("sha256~fake-ca-token"), Ct));
                exception.InnerException.ShouldBeOfType<HttpRequestException>();
            }
        }
        finally
        {
            File.Delete(caFile);
        }
    }

    /// <summary>Sends 200 headers, then the connection breaks while the body is read.</summary>
    private sealed class BrokenBodyHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StreamContent(new BrokenStream()) });
    }

    private sealed class BrokenStream : MemoryStream
    {
        public override int Read(byte[] buffer, int offset, int count) => throw new IOException("Connection reset (test)");

        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) =>
            throw new IOException("Connection reset (test)");

        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
            throw new IOException("Connection reset (test)");
    }

    private static int UnusedPort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        return ((IPEndPoint)listener.LocalEndpoint).Port;
    }
}
