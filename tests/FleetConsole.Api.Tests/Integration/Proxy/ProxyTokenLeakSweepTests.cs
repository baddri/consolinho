using System.Net;
using System.Text;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;

namespace FleetConsole.Api.Tests.Integration.Proxy;

/// <summary>
/// QA sweep SEC-4 (CP1 D3/R4 carry-over, extends <see cref="Admin.TokenLeakSweepTests"/> to the proxy): one SA token
/// with a recognisable value is used for every kind of proxy outcome — allowed read and write, denied write, upstream
/// 500, TLS failure, rejected credential, unreachable cluster, rejected path. Afterwards every response FleetConsole
/// produced (bodies and headers), the audit entries, the database and every captured log line are scanned for the token
/// in plain, base64 and base64url form.
/// </summary>
/// <remarks>
/// The fake API server never echoes the bearer token here: an upstream body is passed through by design, so echoing
/// would only test the fake. Proof that the token was really used is that the fake saw it as <c>Authorization</c>.
/// </remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProxyTokenLeakSweepTests(ApiFactory factory)
{
    private const string ConfigMap = "/api/v1/namespaces/shop/configmaps/web";
    private const string Failing = "/api/v1/namespaces/shop/configmaps/boom";
    private const string Rejected = "/api/v1/namespaces/shop/secrets";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task NoToken_InAnyProxyResponse_AuditEntry_DatabaseRow_OrLogLine()
    {
        var token = $"sec4-sweep-sa-token.{TestData.Unique()}{TestData.Unique()}.not-a-real-signature";
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        await using var other = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var stopped = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var stoppedUrl = stopped.BaseAddress.ToString();
        await stopped.DisposeAsync();

        server.Respond("GET", ConfigMap, 200, new { kind = "ConfigMap", metadata = new { name = "web" } });
        server.Respond("PUT", ConfigMap, 200, new { kind = "ConfigMap", metadata = new { name = "web" } });
        server.Respond("GET", Failing, 500, new { kind = "Status", code = 500, message = "etcd is sad" });
        server.Respond("GET", Rejected, 401, new { kind = "Status", code = 401, message = "Unauthorized" });

        var username = factory.NewUsername();
        var (readWrite, _) = await factory.Data.ProxyClusterAsync(server, username, AccessMode.ReadWrite, token);
        var readOnly = await GrantedClusterAsync(username, server.BaseAddress.ToString(), server.CaBundlePem, AccessMode.ReadOnly, token);
        var wrongCa = await GrantedClusterAsync(username, server.BaseAddress.ToString(), other.CaBundlePem, AccessMode.ReadWrite, token);
        var unreachable = await GrantedClusterAsync(username, stoppedUrl, server.CaBundlePem, AccessMode.ReadWrite, token);
        using var client = await ProxyTestClient.LoginAsync(factory, username);

        var haystacks = new List<string>();
        async Task SendAsync(HttpMethod method, string cluster, string path, HttpStatusCode expected)
        {
            using var content = method == HttpMethod.Put ? new StringContent("{\"kind\":\"ConfigMap\"}", Encoding.UTF8, "application/json") : null;
            using var response = await client.SendAsync(method, cluster, path, content);
            response.StatusCode.ShouldBe(expected, $"{method} {cluster} {path}");
            haystacks.Add(string.Join('\n', response.Headers.Concat(response.Content.Headers).Select(h => $"{h.Key}: {string.Join(", ", h.Value)}")));
            haystacks.Add(await response.Content.ReadAsStringAsync(Ct));
        }

        await SendAsync(HttpMethod.Get, readWrite.Name, ConfigMap, HttpStatusCode.OK);                    // allowed GET
        await SendAsync(HttpMethod.Put, readWrite.Name, ConfigMap, HttpStatusCode.OK);                    // allowed PUT
        await SendAsync(HttpMethod.Put, readOnly, ConfigMap, HttpStatusCode.Forbidden);                   // denied PUT
        await SendAsync(HttpMethod.Get, readWrite.Name, Failing, HttpStatusCode.InternalServerError);     // upstream 500
        await SendAsync(HttpMethod.Get, wrongCa, ConfigMap, HttpStatusCode.BadGateway);                   // TLS error
        await SendAsync(HttpMethod.Get, readWrite.Name, Rejected, HttpStatusCode.BadGateway);             // credential rejected
        await SendAsync(HttpMethod.Get, unreachable, ConfigMap, HttpStatusCode.BadGateway);               // unreachable
        await SendAsync(HttpMethod.Get, readWrite.Name, "/api/%2e%2e/secrets", HttpStatusCode.BadRequest); // path rejected

        // The token really travelled: the cluster saw it as the bearer (allowed GET/PUT, 500, 401).
        server.Requests.Count(r => r.Authorization == $"Bearer {token}").ShouldBe(4);

        var audit = (await factory.Data.AuditEntriesAsync(username)).Where(e => e.Category == AuditCategory.Proxy).ToList();
        audit.Count.ShouldBe(2, "allowed PUT + denied PUT");
        var database = await TokenLeakScanner.DumpDatabaseAsync(factory.ConnectionString, Ct);
        string[] all = [.. haystacks, .. audit.Select(e => e.DetailsJson), .. audit.Select(e => e.Summary), database, factory.Logs.AllText];

        var bytes = Encoding.UTF8.GetBytes(token);
        var base64 = Convert.ToBase64String(bytes);
        foreach (var form in new[] { token, base64, base64.TrimEnd('=').Replace('+', '-').Replace('/', '_') })
        {
            TokenLeakScanner.AssertAbsent(form, all);
        }
    }

    // An enabled cluster at apiUrl trusting caBundlePem, with its own credential holding token, granted to username.
    private async Task<string> GrantedClusterAsync(string username, string apiUrl, string caBundlePem, AccessMode mode, string token)
    {
        var cluster = await factory.Data.ClusterAsync(apiUrl: apiUrl, caBundlePem: caBundlePem);
        var credential = await factory.Data.CredentialAsync(cluster.Name, token);
        await factory.Data.GrantAsync(username, cluster.Name, credential.Id, mode);
        return cluster.Name;
    }
}
