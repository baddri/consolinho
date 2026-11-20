using System.Net;
using System.Net.Http.Json;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Api.Tests.Integration;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using FleetConsole.Domain.Access;
using Microsoft.AspNetCore.Http;
using static FleetConsole.Api.Tests.Integration.Admin.Credentials.CredentialApi;

namespace FleetConsole.Api.Tests.Kubernetes;

/// <summary>
/// Self-tests of the <see cref="FakeKubeApiServer"/> features the proxy tests (T-0061/T-0062) rely on (T-0057): prefix
/// routing, full header and raw-target recording, held-open watch streams, scripted headers and delays, and one CA per
/// server instance. If these break, proxy test failures would be misleading, so they are pinned here.
/// </summary>
public sealed class FakeKubeApiServerTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // ---- routing -------------------------------------------------------------------------------------------------

    [Fact]
    public async Task ExactRouteBeatsPrefix_LongestPrefixWins_UnmatchedIs404Status()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapPrefix("GET", "/api/", Text("short-prefix"));
        server.MapPrefix("GET", "/api/v1/namespaces/", Text("long-prefix"));
        server.MapGet("/api/v1/namespaces/default", Text("exact"));
        using var client = TrustingClient(server);

        (await client.GetStringAsync(new Uri("/api/v1/namespaces/default", UriKind.Relative), Ct)).ShouldBe("exact");
        (await client.GetStringAsync(new Uri("/api/v1/namespaces/default/pods", UriKind.Relative), Ct)).ShouldBe("long-prefix");
        (await client.GetStringAsync(new Uri("/api/v1/nodes", UriKind.Relative), Ct)).ShouldBe("short-prefix");

        using var otherMethod = await client.DeleteAsync(new Uri("/api/v1/nodes", UriKind.Relative), Ct);
        using var unmatched = await client.GetAsync(new Uri("/apis/apps/v1/deployments", UriKind.Relative), Ct);
        foreach (var response in new[] { otherMethod, unmatched })
        {
            response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
            var status = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
            status.GetProperty("kind").GetString().ShouldBe("Status");
            status.GetProperty("code").GetInt32().ShouldBe(404);
        }
    }

    // ---- recording -----------------------------------------------------------------------------------------------

    [Fact]
    public async Task RecordsEveryHeader_IncludingDuplicateLines_AndTheRawTarget()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);

        // Raw HTTP/1.1, because HttpClient folds repeated headers into one line; the fake must keep both lines.
        const string target = "/api/v1/namespaces/default/configmaps/a%2Fb?labelSelector=app%3Dweb&x=1";
        var response = await SendRawAsync(server,
            $"GET {target} HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer fake-token\r\n" +
            "X-Dup: one\r\nX-Dup: two\r\nImpersonate-User: someone\r\nConnection: close\r\n\r\n");

        response.ShouldStartWith("HTTP/1.1 404");
        var request = server.Requests.ShouldHaveSingleItem();
        request.RawTarget.ShouldBe(target);
        request.Headers["x-dup"].ShouldBe(["one", "two"]);
        request.Headers["IMPERSONATE-USER"].ShouldBe(["someone"]);
        request.Headers["Authorization"].ShouldBe(["Bearer fake-token"]);
        request.Authorization.ShouldBe("Bearer fake-token");
    }

    // ---- watch streams -------------------------------------------------------------------------------------------

    [Fact]
    public async Task Watch_DeliversEachEventWithin1s_WhileTheResponseStaysOpen_AndCloseEndsIt()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.Respond("GET", "/api/v1/pods", 200, new { kind = "PodList", items = Array.Empty<object>() });
        var watch = server.MapWatch("/api/v1/pods");
        using var client = TrustingClient(server);

        // Sent before the client connects: waits for it.
        var early = watch.SendAsync("ADDED", new { metadata = new { name = "early" } }, Ct);
        using var response = await client.GetAsync(
            new Uri("/api/v1/pods?watch=1&timeoutSeconds=42", UriKind.Relative), HttpCompletionOption.ResponseHeadersRead, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.ShouldBe("application/json");
        response.Content.Headers.ContentLength.ShouldBeNull();
        (await watch.Connected.WaitAsync(TimeSpan.FromSeconds(1), Ct)).ShouldBe(42);
        await early.WaitAsync(TimeSpan.FromSeconds(1), Ct);

        using var reader = new StreamReader(await response.Content.ReadAsStreamAsync(Ct));
        var first = JsonDocument.Parse((await ReadLineWithin1sAsync(reader))!).RootElement;
        first.GetProperty("type").GetString().ShouldBe("ADDED");
        first.GetProperty("object").GetProperty("metadata").GetProperty("name").GetString().ShouldBe("early");

        await watch.SendAsync("MODIFIED", new { metadata = new { name = "later" } }, Ct);
        var second = JsonDocument.Parse((await ReadLineWithin1sAsync(reader))!).RootElement;
        second.GetProperty("type").GetString().ShouldBe("MODIFIED");

        await watch.CloseAsync();
        (await ReadLineWithin1sAsync(reader)).ShouldBeNull();

        // A non-watch GET on the same path uses the normal route.
        (await client.GetStringAsync(new Uri("/api/v1/pods", UriKind.Relative), Ct)).ShouldContain("PodList");
    }

    [Fact]
    public async Task Watch_EndsTheResponse_WhenTimeoutSecondsElapses()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var watch = server.MapWatch("/api/v1/pods");
        using var client = TrustingClient(server);
        using var response = await client.GetAsync(
            new Uri("/api/v1/pods?watch=1&timeoutSeconds=1", UriKind.Relative), HttpCompletionOption.ResponseHeadersRead, Ct);
        (await watch.Connected.WaitAsync(TimeSpan.FromSeconds(1), Ct)).ShouldBe(1);
        var started = TimeProvider.System.GetTimestamp();

        using var reader = new StreamReader(await response.Content.ReadAsStreamAsync(Ct));
        (await reader.ReadToEndAsync(Ct).WaitAsync(TimeSpan.FromSeconds(3), Ct)).ShouldBeEmpty();

        TimeProvider.System.GetElapsedTime(started).ShouldBeGreaterThanOrEqualTo(TimeSpan.FromMilliseconds(500));
    }

    [Fact]
    public async Task Watch_WithoutTimeoutSeconds_ReportsZero_AndDisposeEndsAnOpenWatch()
    {
        var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var watch = server.MapWatch("/api/v1/pods");
        using var client = TrustingClient(server);
        using var response = await client.GetAsync(
            new Uri("/api/v1/pods?watch=true", UriKind.Relative), HttpCompletionOption.ResponseHeadersRead, Ct);

        (await watch.Connected.WaitAsync(TimeSpan.FromSeconds(1), Ct)).ShouldBe(0);
        await server.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(5), Ct);
    }

    // ---- scripted headers and delays -----------------------------------------------------------------------------

    [Fact]
    public async Task RespondWithHeaders_SetsTheHeaders_AndAStatusBody()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.RespondWithHeaders("GET", "/api", 401, new Dictionary<string, string>
        {
            ["Set-Cookie"] = "upstream=secret; Path=/",
            ["WWW-Authenticate"] = "Bearer realm=\"kubernetes\"",
        });
        using var client = TrustingClient(server);

        using var response = await client.GetAsync(new Uri("/api", UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        response.Headers.GetValues("Set-Cookie").ShouldBe(["upstream=secret; Path=/"]);
        response.Headers.WwwAuthenticate.ToString().ShouldBe("Bearer realm=\"kubernetes\"");
        (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("code").GetInt32().ShouldBe(401);
    }

    [Fact]
    public async Task Delay_HoldsTheAnswer_AndHonoursClientAbort()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion();
        server.Delay("GET", "/version", TimeSpan.FromMilliseconds(300));
        using var client = TrustingClient(server);

        var started = TimeProvider.System.GetTimestamp();
        using (var response = await client.GetAsync(new Uri("/version", UriKind.Relative), Ct))
        {
            response.StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        TimeProvider.System.GetElapsedTime(started).ShouldBeGreaterThanOrEqualTo(TimeSpan.FromMilliseconds(250));

        server.Delay("GET", "/version", TimeSpan.FromMinutes(5));
        using var shortTimeout = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        shortTimeout.CancelAfter(TimeSpan.FromMilliseconds(200));
        await Should.ThrowAsync<TaskCanceledException>(() => client.GetAsync(new Uri("/version", UriKind.Relative), shortTimeout.Token));
    }

    // ---- one CA per server ---------------------------------------------------------------------------------------

    [Fact]
    public async Task TwoServers_HaveDistinctCas_AClientTrustingAFailsAgainstB()
    {
        await using var a = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        await using var b = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        a.MapVersion();
        b.MapVersion();

        a.CaBundlePem.ShouldNotBe(b.CaBundlePem);
        using var trustsA = TrustingClient(a);
        using var okResponse = await trustsA.GetAsync(new Uri(a.BaseAddress, "/version"), Ct);
        okResponse.StatusCode.ShouldBe(HttpStatusCode.OK);

        var failure = await Should.ThrowAsync<HttpRequestException>(() => trustsA.GetAsync(new Uri(b.BaseAddress, "/version"), Ct));
        failure.InnerException.ShouldBeOfType<AuthenticationException>();
    }

    // ---- helpers -------------------------------------------------------------------------------------------------

    private static RequestDelegate Text(string text) => context => context.Response.WriteAsync(text, context.RequestAborted);

    private static async Task<string?> ReadLineWithin1sAsync(StreamReader reader)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(1));
        return await reader.ReadLineAsync(timeout.Token);
    }

    /// <summary>An HttpClient whose only trust anchor is <paramref name="server"/>'s CA (like a cluster with a CA bundle).</summary>
    private static HttpClient TrustingClient(FakeKubeApiServer server) =>
        new(new SocketsHttpHandler { SslOptions = { RemoteCertificateValidationCallback = TrustOnly(server) } })
        {
            BaseAddress = server.BaseAddress,
        };

    private static RemoteCertificateValidationCallback TrustOnly(FakeKubeApiServer server)
    {
        var ca = X509Certificate2.CreateFromPem(server.CaBundlePem);
        return (_, certificate, _, errors) =>
        {
            if (certificate is not X509Certificate2 leaf || (errors & ~SslPolicyErrors.RemoteCertificateChainErrors) != SslPolicyErrors.None)
            {
                return false;
            }

            using var chain = new X509Chain();
            chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
            chain.ChainPolicy.CustomTrustStore.Add(ca);
            chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
            return chain.Build(leaf);
        };
    }

    private static async Task<string> SendRawAsync(FakeKubeApiServer server, string request)
    {
        using var tcp = new TcpClient();
        await tcp.ConnectAsync(IPAddress.Loopback, server.BaseAddress.Port, Ct);
        await using var tls = new SslStream(tcp.GetStream(), leaveInnerStreamOpen: false);
        await tls.AuthenticateAsClientAsync(new SslClientAuthenticationOptions
        {
            TargetHost = "127.0.0.1",
            ApplicationProtocols = [SslApplicationProtocol.Http11],
            RemoteCertificateValidationCallback = TrustOnly(server),
        }, Ct);
        await tls.WriteAsync(Encoding.ASCII.GetBytes(request), Ct);
        await tls.FlushAsync(Ct);
        using var reader = new StreamReader(tls, Encoding.ASCII);
        return await reader.ReadToEndAsync(Ct);
    }
}

/// <summary>
/// <see cref="TestData.ProxyClusterAsync"/> against a real host: the seeded cluster shows up in the user's switcher with
/// the granted mode, and the seeded URL + CA bundle + token reach the fake API server over verified TLS (T-0057).
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProxyClusterSeedingTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task ProxyClusterAsync_SeedsAUsableClusterCredentialAndGrant()
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        server.MapVersion();
        var token = Jwt();
        var username = factory.NewUsername();

        var (cluster, credential) = await factory.Data.ProxyClusterAsync(server, username, AccessMode.ReadWrite, token);

        using var user = await factory.LoginAsAsync(username);
        var clusters = await user.GetFromJsonAsync<JsonElement>(new Uri("/api/clusters", UriKind.Relative), Ct);
        var seeded = clusters.EnumerateArray().ShouldHaveSingleItem();
        seeded.GetProperty("name").GetString().ShouldBe(cluster.Name);
        seeded.GetProperty("accessMode").GetString().ShouldBe("readWrite");
        credential.Token.ShouldBe(token);

        // The connection test uses the stored URL, CA bundle and decrypted token: the first step reaching /version proves
        // all three (the later steps aren't scripted and may fail).
        using var admin = await factory.AdminClientAsync();
        using var test = await admin.PostAsJsonAsync(ClusterCredentials(cluster.Name, $"/{credential.Id.Value}/test"), new { }, Ct);
        test.StatusCode.ShouldBe(HttpStatusCode.OK);
        server.Requests.ShouldContain(r => r.Path == "/version" && r.Authorization == $"Bearer {token}");
    }
}
