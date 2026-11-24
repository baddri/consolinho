using System.Net;
using System.Text;
using System.Text.Json;
using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;
using static FleetConsole.Api.Tests.Integration.Proxy.ProxyStreamingAndAuditTests;

namespace FleetConsole.Api.Tests.Integration.Proxy;

/// <summary>
/// CP4a proxy acceptance (T-0157): every mutation verb the workload pages send — Deployment and Pod patches, the scale
/// subresource, Pod delete, Job create and kubectl-style exec — × {ReadOnly grant, globally read-only user, ReadWrite
/// grant}; T-0201 adds the CP4b write paths — DeploymentConfig instantiate (Start rollout), rollback and update, and a
/// Secret patch (Edit Secret, CFG-4); T-0324 adds the CP5 shapes that ship without endpoints — PVC expand, node
/// (un)cordon and Create Project (SAFE5-2/3, QG5B-1). Refusals never reach the cluster and are audited as denied (ACT-5, TERM-4); allowed requests carry only the
/// grant's token upstream, no browser cookie (SAFE-2), and are audited with action and subresource (SAFE-4).
/// </summary>
/// <remarks>
/// The browser terminal's WebSocket upgrade of the exec path needs real sockets and is covered by
/// <see cref="ProxyKestrelTests"/>; here exec is the plain <c>POST</c> kubectl sends before its SPDY upgrade.
/// </remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProxyMutationVerbTests(ApiFactory factory)
{
    private const string Deployment = "/apis/apps/v1/namespaces/shop/deployments/web";
    private const string Pod = "/api/v1/namespaces/shop/pods/web-1";
    private const string Jobs = "/apis/batch/v1/namespaces/shop/jobs";
    private const string DeploymentConfig = "/apis/apps.openshift.io/v1/namespaces/shop/deploymentconfigs/web";
    private const string Secret = "/api/v1/namespaces/shop/secrets/web-tls";
    private const string Pvc = "/api/v1/namespaces/shop/persistentvolumeclaims/data";
    private const string Node = "/api/v1/nodes/worker-1";
    private const string ProjectRequests = "/apis/project.openshift.io/v1/projectrequests";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>Who sends the request.</summary>
    public enum Principal
    {
        /// <summary>A ReadOnly grant: refused with <c>Proxy.ReadOnlyGrant</c>.</summary>
        ReadOnlyGrant,

        /// <summary>A globally read-only user with a ReadWrite grant: refused with <c>Proxy.UserReadOnly</c>.</summary>
        ReadOnlyUser,

        /// <summary>A ReadWrite grant: forwarded.</summary>
        ReadWrite,
    }

    /// <summary>
    /// The CP4a, CP4b and CP5 verb rows (method, Kubernetes path and query, body content type or null, expected audit action suffix,
    /// expected subresource) × every principal.
    /// </summary>
    public static TheoryData<Principal, string, string, string?, string, string?> Rows()
    {
        (string Method, string Path, string? ContentType, string Action, string? Subresource)[] verbs =
        [
            ("PATCH", Deployment, "application/json-patch+json", "patch", null),           // pause, restart, rollback
            ("PATCH", Deployment, "application/merge-patch+json", "patch", null),          // labels, annotations, strategy
            ("PATCH", Deployment + "/scale", "application/merge-patch+json", "patch", "scale"), // DEP-4/5
            ("PATCH", Pod, "application/merge-patch+json", "patch", null),                 // pod labels/annotations
            ("DELETE", Pod, null, "delete", null),                                        // DEP-1
            ("POST", Jobs, "application/json", "create", null),                           // Job create
            ("POST", Pod + "/exec?command=sh&container=app&stdin=true", null, "connect", "exec"), // kubectl-style exec
            ("POST", DeploymentConfig + "/instantiate", "application/json", "create", "instantiate"), // CP4b: Start rollout
            ("POST", DeploymentConfig + "/rollback", "application/json", "create", "rollback"),       // CP4b: DC rollback
            ("PUT", DeploymentConfig, "application/json", "update", null),                           // CP4b: Edit DC
            ("PATCH", Secret, "application/merge-patch+json", "patch", null),                         // CP4b: Edit Secret
            ("PATCH", Pvc, "application/merge-patch+json", "patch", null),                            // CP5: PVC expand
            ("PATCH", Node, "application/strategic-merge-patch+json", "patch", null),                 // CP5: (un)cordon, cluster-scoped
            ("POST", ProjectRequests, "application/json", "create", null),                            // CP5: Create Project
        ];

        var rows = new TheoryData<Principal, string, string, string?, string, string?>();
        foreach (var principal in Enum.GetValues<Principal>())
        {
            foreach (var (method, path, contentType, action, subresource) in verbs)
            {
                rows.Add(principal, method, path, contentType, action, subresource);
            }
        }

        return rows;
    }

    [Theory]
    [MemberData(nameof(Rows))]
    public async Task Verb_Is_Refused_For_Read_Only_Or_Forwarded_With_Only_The_Grant_Token_And_Audited(
        Principal principal, string method, string pathAndQuery, string? contentType, string action, string? subresource)
    {
        await using var server = await FakeKubeApiServer.StartAsync(cancellationToken: Ct);
        var path = pathAndQuery.Split('?')[0];
        server.Respond(method, path, method == "POST" ? 201 : 200, new { kind = "Status", status = "Success" });
        var token = $"fake-cp4a-grant-token.{TestData.Unique()}";
        var username = factory.NewUsername();
        if (principal == Principal.ReadOnlyUser)
        {
            await factory.Data.UserAsync(username, isReadOnly: true);
        }

        var mode = principal == Principal.ReadOnlyGrant ? AccessMode.ReadOnly : AccessMode.ReadWrite;
        var (cluster, _) = await factory.Data.ProxyClusterAsync(server, username, mode, token);
        using var client = await ProxyTestClient.LoginAsync(factory, username);

        using var content = contentType is null ? null : new StringContent("{}", Encoding.UTF8, contentType);
        // Strip the charset StringContent adds: patch types are matched exactly by the API server.
        if (content is not null)
        {
            content.Headers.ContentType!.CharSet = null;
        }

        using var response = await client.SendAsync(new HttpMethod(method), cluster.Name, pathAndQuery, content);

        var entry = await SingleProxyEntryAsync(factory, username);
        entry.Action.ShouldBe("proxy." + action);
        var details = Details(entry);
        (details.TryGetProperty("subresource", out var s) && s.ValueKind == JsonValueKind.String ? s.GetString() : null).ShouldBe(subresource);

        if (principal == Principal.ReadWrite)
        {
            response.IsSuccessStatusCode.ShouldBeTrue($"{method} {pathAndQuery} → {(int)response.StatusCode}");
            var seen = server.Requests.ShouldHaveSingleItem();
            seen.Method.ShouldBe(method);
            seen.RawTarget.ShouldBe(pathAndQuery, "path and query forwarded byte-for-byte");
            seen.Headers["Authorization"].ShouldBe([$"Bearer {token}"], "exactly one bearer: the grant's token");
            seen.Headers.ShouldNotContainKey("Cookie");
            details.GetProperty("outcome").GetString().ShouldBe("allowed");
            details.GetProperty("statusCode").GetInt32().ShouldBe((int)response.StatusCode);
        }
        else
        {
            var code = principal == Principal.ReadOnlyGrant ? "Proxy.ReadOnlyGrant" : "Proxy.UserReadOnly";
            response.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
            (await ProxyTestClient.ProblemAsync(response)).GetProperty("code").GetString().ShouldBe(code);
            server.Requests.ShouldBeEmpty("a refusal never reaches the cluster");
            details.GetProperty("outcome").GetString().ShouldBe("denied");
            details.GetProperty("statusCode").GetInt32().ShouldBe(403);
            details.GetProperty("reason").GetString().ShouldBe(principal == Principal.ReadOnlyGrant ? "readOnlyGrant" : "userReadOnly");
        }

        (await factory.Data.AuditEntriesAsync(username)).Count(e => e.Category == AuditCategory.Proxy).ShouldBe(1);
    }
}
