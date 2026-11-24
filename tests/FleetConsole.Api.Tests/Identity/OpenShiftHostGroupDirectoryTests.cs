using System.Collections.Concurrent;
using System.Net;
using System.Text;
using FleetConsole.Api.Tests.Integration;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Infrastructure.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Tests.Identity;

/// <summary>
/// <c>OpenShiftHostGroupDirectory</c> with a manual clock and a fake host (T-0254, ADR-0039 §2/§5): snapshot reuse and
/// expiry, fail-safe off, single-flight, failure mapping, the token file re-read per refresh and never logged, and the
/// <c>Auth:HostGroups</c> options rules.
/// </summary>
public sealed class OpenShiftHostGroupDirectoryTests : IDisposable
{
    private const string InlineToken = "fake-inline-groups-token-0001";
    private static readonly TimeSpan MaxAge = TimeSpan.FromSeconds(15);

    private readonly ManualClock _clock = new();
    private readonly CapturedLogs _logs = new();
    private readonly FakeGroupsHost _hostApi = new();
    private readonly List<IHost> _hosts = [];

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public void Dispose()
    {
        foreach (var host in _hosts)
        {
            host.Dispose();
        }
    }

    private IHostGroupDirectory Directory(Dictionary<string, string?>? extra = null)
    {
        var configuration = IdentityTestHost.DevConfiguration();
        configuration["Auth:HostGroups:Token"] = InlineToken;
        foreach (var (key, value) in extra ?? [])
        {
            configuration[key] = value;
        }

        var host = IdentityTestHost.Build(configuration, () => _hostApi, logs: _logs, clock: _clock);
        _hosts.Add(host);
        return host.Services.GetRequiredService<IHostGroupDirectory>();
    }

    [Fact]
    public async Task Ok_MapsGroups_DropsVirtualGroups_AndAnswersGroupsOf()
    {
        _hostApi.Respond = _ => FakeGroupsHost.Json(
            """{"metadata":{},"items":[{"metadata":{"name":"sre"},"users":["alice","bob","alice"]},""" +
            """{"metadata":{"name":"system:cluster-admins"},"users":["alice"]},{"metadata":{"name":"empty"},"users":null},""" +
            """{"metadata":{"name":"auditors"},"users":["Alice"]}]}""");
        var directory = Directory();

        var listing = await directory.GetAsync(Ct);

        listing.Status.ShouldBe(HostGroupsStatus.Ok);
        listing.ReadAt.ShouldBe(_clock.UtcNow);
        listing.Groups.Select(g => g.Name).ShouldBe(["auditors", "empty", "sre"]);
        listing.Groups.Single(g => g.Name == "sre").Users.ShouldBe(["alice", "bob"]);
        listing.Groups.Single(g => g.Name == "empty").Users.ShouldBeEmpty();
        listing.GroupsOf("alice").ShouldBe(["sre"], "ordinal match, system:* removed");
        _hostApi.Requests.Single().Authorization.ShouldBe($"Bearer {InlineToken}");
        _hostApi.Requests.Single().Uri.PathAndQuery.ShouldBe("/apis/user.openshift.io/v1/groups?limit=500");
    }

    [Fact]
    public async Task Snapshot_IsReusedWithinMaxAge_AndRefreshedAfter()
    {
        _hostApi.Respond = _ => FakeGroupsHost.Json("""{"items":[{"metadata":{"name":"sre"},"users":["alice"]}]}""");
        var directory = Directory();

        var first = await directory.GetAsync(Ct);
        _clock.Advance(MaxAge - TimeSpan.FromMilliseconds(1));
        var second = await directory.GetAsync(Ct);
        _hostApi.Requests.Count.ShouldBe(1);
        second.ShouldBeSameAs(first);

        _clock.Advance(TimeSpan.FromMilliseconds(1));
        var third = await directory.GetAsync(Ct);
        _hostApi.Requests.Count.ShouldBe(2);
        third.ReadAt.ShouldBe(_clock.UtcNow);
    }

    [Fact]
    public async Task FailedRefresh_NeverServesTheOldSnapshot_AndTheNextCallRetries()
    {
        _hostApi.Respond = _ => FakeGroupsHost.Json("""{"items":[{"metadata":{"name":"sre"},"users":["alice"]}]}""");
        var directory = Directory();
        (await directory.GetAsync(Ct)).Status.ShouldBe(HostGroupsStatus.Ok);

        _clock.Advance(MaxAge);
        _hostApi.Respond = _ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
        var failed = await directory.GetAsync(Ct);
        failed.Status.ShouldBe(HostGroupsStatus.Unavailable);
        failed.Groups.ShouldBeEmpty();
        failed.ReadAt.ShouldBeNull();
        failed.GroupsOf("alice").ShouldBeEmpty();

        // No clock movement: a failure is not cached, the next caller asks the host again.
        (await directory.GetAsync(Ct)).Status.ShouldBe(HostGroupsStatus.Unavailable);
        _hostApi.Requests.Count.ShouldBe(3);

        _hostApi.Respond = _ => FakeGroupsHost.Json("""{"items":[]}""");
        (await directory.GetAsync(Ct)).Status.ShouldBe(HostGroupsStatus.Ok);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, HostGroupsStatus.Forbidden)]
    [InlineData(HttpStatusCode.Forbidden, HostGroupsStatus.Forbidden)]
    [InlineData(HttpStatusCode.NotFound, HostGroupsStatus.Unavailable)]
    [InlineData(HttpStatusCode.InternalServerError, HostGroupsStatus.Unavailable)]
    public async Task HttpStatus_MapsToStatus(HttpStatusCode status, HostGroupsStatus expected)
    {
        _hostApi.Respond = _ => new HttpResponseMessage(status);

        (await Directory().GetAsync(Ct)).Status.ShouldBe(expected);
    }

    [Fact]
    public async Task UnreachableHost_BadJson_Timeout_AreUnavailable()
    {
        var directory = Directory();
        _hostApi.Respond = _ => throw new HttpRequestException("Connection refused (test)");
        (await directory.GetAsync(Ct)).Status.ShouldBe(HostGroupsStatus.Unavailable);

        _hostApi.Respond = _ => FakeGroupsHost.Json("{ not json");
        (await directory.GetAsync(Ct)).Status.ShouldBe(HostGroupsStatus.Unavailable);

        // HttpClient's own timeout surfaces as TaskCanceledException without the caller's token being cancelled.
        _hostApi.Respond = _ => throw new TaskCanceledException("timeout (test)");
        (await directory.GetAsync(Ct)).Status.ShouldBe(HostGroupsStatus.Unavailable);
    }

    [Fact]
    public async Task RefreshSlowerThanMaxAge_IsUnavailable()
    {
        _hostApi.Respond = _ =>
        {
            _clock.Advance(MaxAge);
            return FakeGroupsHost.Json("""{"items":[]}""");
        };

        (await Directory().GetAsync(Ct)).Status.ShouldBe(HostGroupsStatus.Unavailable);
    }

    [Fact]
    public async Task ConcurrentCallers_ShareOneHostRequest()
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _hostApi.RespondAsync = async _ =>
        {
            await release.Task;
            return FakeGroupsHost.Json("""{"items":[{"metadata":{"name":"sre"},"users":["alice"]}]}""");
        };
        var directory = Directory();

        var callers = Enumerable.Range(0, 8).Select(_ => directory.GetAsync(Ct)).ToList();
        await Task.Delay(50, Ct);
        release.SetResult();
        var results = await Task.WhenAll(callers);

        _hostApi.Requests.Count.ShouldBe(1);
        results.ShouldAllBe(listing => ReferenceEquals(listing, results[0]));
    }

    [Fact]
    public async Task ConcurrentCallers_ShareAFailedRefresh_TooAndLogTheTransitionOnce()
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _hostApi.RespondAsync = async _ =>
        {
            await release.Task;
            return new HttpResponseMessage(HttpStatusCode.Forbidden);
        };
        var directory = Directory();

        var callers = Enumerable.Range(0, 5).Select(_ => directory.GetAsync(Ct)).ToList();
        await Task.Delay(50, Ct);
        release.SetResult();
        var results = await Task.WhenAll(callers);
        (await directory.GetAsync(Ct)).Status.ShouldBe(HostGroupsStatus.Forbidden);

        results.ShouldAllBe(listing => listing.Status == HostGroupsStatus.Forbidden);
        _hostApi.Requests.Count.ShouldBe(2, "the waiters shared the first refresh; the later call retried");
        _logs.Entries.Count(e => e.EventId == 3321).ShouldBe(1, "logged once per status transition");
    }

    [Fact]
    public async Task Paging_FollowsContinue()
    {
        _hostApi.Respond = request => request.RequestUri!.Query.Contains("continue=", StringComparison.Ordinal)
            ? FakeGroupsHost.Json("""{"metadata":{},"items":[{"metadata":{"name":"b"},"users":["bob"]}]}""")
            : FakeGroupsHost.Json("""{"metadata":{"continue":"next page/1"},"items":[{"metadata":{"name":"a"},"users":["alice"]}]}""");

        var listing = await Directory().GetAsync(Ct);

        listing.Groups.Select(g => g.Name).ShouldBe(["a", "b"]);
        _hostApi.Requests[1].Uri.Query.ShouldBe("?limit=500&continue=next%20page%2F1");
    }

    [Fact]
    public async Task TokenFile_IsReReadOnEveryRefresh_AndNeverLogged()
    {
        var directoryPath = System.IO.Directory.CreateTempSubdirectory("fleetconsole-hostgroups-").FullName;
        var tokenPath = Path.Combine(directoryPath, "token");
        const string FirstToken = "fake-projected-token-first-0001";
        const string SecondToken = "fake-projected-token-second-0002";
        await File.WriteAllTextAsync(tokenPath, FirstToken + "\n", Ct);
        _hostApi.Respond = _ => new HttpResponseMessage(HttpStatusCode.Forbidden);
        var directory = Directory(new() { ["Auth:HostGroups:Token"] = string.Empty, ["Auth:HostGroups:TokenPath"] = tokenPath });

        await directory.GetAsync(Ct);
        await File.WriteAllTextAsync(tokenPath, SecondToken, Ct);
        await directory.GetAsync(Ct);
        File.Delete(tokenPath);
        var missing = await directory.GetAsync(Ct);

        _hostApi.Requests.Select(r => r.Authorization).ShouldBe([$"Bearer {FirstToken}", $"Bearer {SecondToken}"]);
        missing.Status.ShouldBe(HostGroupsStatus.Unavailable, "no token file: no request, unavailable");
        TokenLeakScanner.AssertAbsent(FirstToken, _logs.AllText);
        TokenLeakScanner.AssertAbsent(SecondToken, _logs.AllText);
        _logs.AllText.ShouldContain("Forbidden");
    }

    [Fact]
    public async Task InlineToken_IsNeverLogged()
    {
        _hostApi.Respond = _ => throw new HttpRequestException("Connection refused (test)");

        await Directory().GetAsync(Ct);

        _logs.Entries.ShouldNotBeEmpty();
        TokenLeakScanner.AssertAbsent(InlineToken, _logs.AllText);
    }

    [Theory]
    [InlineData("Production", InlineToken, "00:00:15", "Auth:HostGroups:Token is only allowed in Development")]
    [InlineData("Development", InlineToken, "00:00:00", "Auth:HostGroups:MaxSnapshotAge")]
    [InlineData("Development", InlineToken, "00:05:01", "Auth:HostGroups:MaxSnapshotAge")]
    [InlineData("Development", InlineToken, "00:05:00", null)]
    [InlineData("Production", "", "00:00:15", null)]
    public void Options_AreValidated(string environment, string token, string maxAge, string? expectedFailure)
    {
        var configuration = IdentityTestHost.DevConfiguration("https://host-api.invalid:6443");
        configuration["Auth:HostGroups:Token"] = token;
        configuration["Auth:HostGroups:MaxSnapshotAge"] = maxAge;
        using var host = IdentityTestHost.Build(configuration, environment: environment);

        var read = () => host.Services.GetRequiredService<IOptions<HostGroupsOptions>>().Value;

        if (expectedFailure is null)
        {
            read().ShouldNotBeNull();
        }
        else
        {
            var exception = Should.Throw<OptionsValidationException>(() => read());
            exception.Message.ShouldContain(expectedFailure);
            exception.Message.ShouldNotContain(InlineToken);
        }
    }

    /// <summary>The host API server stand-in: records each request's URL and Authorization header, answers via a delegate.</summary>
    private sealed class FakeGroupsHost : HttpMessageHandler
    {
        private readonly ConcurrentQueue<(Uri Uri, string? Authorization)> _requests = new();

        public Func<HttpRequestMessage, HttpResponseMessage> Respond { get; set; } = _ => new HttpResponseMessage(HttpStatusCode.NotFound);

        public Func<HttpRequestMessage, Task<HttpResponseMessage>>? RespondAsync { get; set; }

        public IReadOnlyList<(Uri Uri, string? Authorization)> Requests => [.. _requests];

        public static HttpResponseMessage Json(string body) =>
            new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            _requests.Enqueue((request.RequestUri!, request.Headers.Authorization?.ToString()));
            var response = RespondAsync is { } respondAsync ? await respondAsync(request) : Respond(request);
            response.RequestMessage = request;
            return response;
        }
    }
}
