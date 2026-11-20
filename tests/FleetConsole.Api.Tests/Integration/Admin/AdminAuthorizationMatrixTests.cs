using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FleetConsole.Api.Http;
using FleetConsole.Api.Tests.Integration.Admin.Clusters;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Integration.Admin;

/// <summary>
/// QA sweep (CP1 VERIFY, ADM-1, ADM-2, AUTH-13): enumerates <em>every</em> mapped <c>/api/admin/*</c> endpoint from the
/// routing data source and calls it over HTTP as anonymous, non-admin, read-only admin, and as an admin without the CSRF
/// header. Unlike the per-feature tests (one query and one command each), a new admin route is covered automatically.
/// </summary>
/// <remarks>
/// Route parameters are filled with values that don't exist: every rejection asserted here must happen before the
/// handler looks anything up, so a 404 would itself be a finding (it would mean the check runs after the lookup).
/// </remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class AdminAuthorizationMatrixTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public void Sweep_SeesEveryAdminFeature()
    {
        // Guards the sweeps below against passing vacuously.
        var paths = AdminRequests().Select(r => $"{r.Method} {r.Path}").ToArray();
        paths.Length.ShouldBeGreaterThanOrEqualTo(28); // users 7, clusters 7, credentials 7, grants 6, audit 1 at CP1
        paths.ShouldContain(p => p.StartsWith("POST /api/admin/clusters/", StringComparison.Ordinal) && p.EndsWith("/test-token", StringComparison.Ordinal));
        paths.ShouldContain(p => p.StartsWith("DELETE /api/admin/grants/", StringComparison.Ordinal));
        paths.ShouldContain(p => p.StartsWith("GET /api/admin/audit", StringComparison.Ordinal));
    }

    [Fact]
    public async Task EveryAdminRoute_Anonymous_Is401ProblemDetails()
    {
        using var client = factory.CreateBrowserClient();
        await AssertEveryAsync(client, AdminRequests(), HttpStatusCode.Unauthorized, "Auth.Unauthenticated");
    }

    [Fact]
    public async Task EveryAdminRoute_NonAdmin_Is403Forbidden()
    {
        using var client = await factory.LoginAsAsync(factory.NewUsername());
        await AssertEveryAsync(client, AdminRequests(), HttpStatusCode.Forbidden, "Auth.Forbidden");
    }

    [Fact]
    public async Task EveryMutatingAdminRoute_ReadOnlyAdmin_Is403ReadOnly()
    {
        using var client = await factory.ReadOnlyAdminClientAsync();
        await AssertEveryAsync(client, AdminRequests().Where(r => r.Method != "GET"), HttpStatusCode.Forbidden, "Auth.ReadOnly");
    }

    [Fact]
    public async Task EmptyClusterBody_ReadOnlyAdmin_IsAFramework400ProblemDetails()
    {
        // Documented exception to ADM-2 (contract §7): a body that fails model binding is rejected before the read-only
        // guard. It must still be ProblemDetails and must not change anything.
        using var client = await factory.ReadOnlyAdminClientAsync();
        using var content = new StringContent("{}", Encoding.UTF8, "application/json");
        using var response = await client.PostAsync(new Uri("/api/admin/clusters", UriKind.Relative), content, Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
    }

    [Fact]
    public async Task EveryAdminQuery_ReadOnlyAdmin_IsNotForbidden()
    {
        using var client = await factory.ReadOnlyAdminClientAsync();
        var failures = new List<string>();
        foreach (var request in AdminRequests().Where(r => r.Method == "GET"))
        {
            using var response = await SendAsync(client, request);
            if (response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized)
            {
                failures.Add($"{request.Method} {request.Path} → {(int)response.StatusCode}");
            }
        }

        failures.ShouldBeEmpty();
    }

    [Fact]
    public async Task EveryMutatingAdminRoute_WithoutCsrfHeader_Is403BeforeTheEndpoint()
    {
        using var client = await factory.AdminClientAsync();
        client.DefaultRequestHeaders.Remove(CsrfHeaderMiddleware.HeaderName);
        await AssertEveryAsync(client, AdminRequests().Where(r => r.Method != "GET"), HttpStatusCode.Forbidden, "Auth.CsrfHeaderMissing");
    }

    private static async Task AssertEveryAsync(HttpClient client, IEnumerable<AdminRequest> requests, HttpStatusCode status, string code)
    {
        var failures = new List<string>();
        foreach (var request in requests)
        {
            using var response = await SendAsync(client, request);
            var body = await response.Content.ReadAsStringAsync(Ct);
            var actualCode = response.Content.Headers.ContentType?.MediaType == "application/problem+json"
                && JsonDocument.Parse(body).RootElement.TryGetProperty("code", out var c) ? c.GetString() : null;
            if (response.StatusCode != status || actualCode != code)
            {
                failures.Add($"{request.Method} {request.Path} → {(int)response.StatusCode} {actualCode ?? "(no problem code)"}");
            }
        }

        failures.ShouldBeEmpty();
    }

    private static Task<HttpResponseMessage> SendAsync(HttpClient client, AdminRequest request)
    {
        var message = new HttpRequestMessage(new HttpMethod(request.Method), new Uri(request.Path, UriKind.Relative));
        if (request.Method is "POST" or "PUT" or "PATCH")
        {
            // A body that binds but is invalid for every command: authorization must win over field validation. The
            // cluster register/update DTOs have required members, so "{}" fails model binding there, which the contract
            // (§7 check order) lets precede Auth.ReadOnly; they get a well-formed body instead
            // (see EmptyClusterBody_ReadOnlyAdmin_IsAFramework400ProblemDetails).
            message.Content = request switch
            {
                { Method: "POST", Path: "/api/admin/clusters/" } => JsonContent.Create(ClusterTestSupport.RegisterBody("qa-ro-probe")),
                { Method: "PUT", Path: "/api/admin/clusters/qa-no-such-cluster" } => JsonContent.Create(ClusterTestSupport.UpdateBody(1)),
                _ => new StringContent("{}", Encoding.UTF8, "application/json"),
            };
        }

        return client.SendAsync(message, Ct);
    }

    private AdminRequest[] AdminRequests() =>
        factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(e => e.RoutePattern.RawText is { } p && p.StartsWith("/api/admin", StringComparison.OrdinalIgnoreCase))
            .SelectMany(e => (e.Metadata.GetMetadata<IHttpMethodMetadata>()?.HttpMethods ?? ["GET"])
                .Select(m => new AdminRequest(m, Fill(e.RoutePattern.RawText!))))
            .ToArray();

    // Replaces each route parameter (with or without a constraint) by a syntactically valid value that doesn't exist.
    private static string Fill(string pattern) =>
        System.Text.RegularExpressions.Regex.Replace(pattern, @"\{(\w+)(:[^}]*)?\}", m => m.Groups[1].Value switch
        {
            "username" => "qa-nobody",
            "name" => "qa-no-such-cluster",
            _ => "00000000-0000-0000-0000-00000000c0de",
        });

    private sealed record AdminRequest(string Method, string Path);
}
