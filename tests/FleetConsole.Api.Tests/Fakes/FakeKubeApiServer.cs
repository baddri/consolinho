using System.Collections.Concurrent;
using System.Net;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.AspNetCore.Server.Kestrel.Https;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Api.Tests.Fakes;

/// <summary>Which server certificate a <see cref="FakeKubeApiServer"/> presents.</summary>
public enum FakeServerCertificate
{
    /// <summary>Issued by the server's CA for <c>localhost</c> and <c>127.0.0.1</c>, currently valid.</summary>
    Valid,

    /// <summary>Issued by the server's CA for the right names, but expired yesterday.</summary>
    Expired,

    /// <summary>Issued by the server's CA, valid, but only for <c>wrong-host.example</c> (no IP SAN).</summary>
    WrongHost,
}

/// <summary>A request the fake server received, for assertions.</summary>
/// <param name="Method">HTTP method.</param>
/// <param name="Path">Request path (no query string).</param>
/// <param name="Query">Query string including <c>?</c>, or empty.</param>
/// <param name="Authorization">The raw <c>Authorization</c> header, or <see langword="null"/>.</param>
/// <param name="Body">The request body as text (empty for none).</param>
/// <param name="Headers">Every request header as received (case-insensitive keys); a header sent on several lines has
/// one value per line, so proxy tests can assert exactly what was forwarded or stripped.</param>
/// <param name="RawTarget">The request target (path + query) exactly as received, percent-encoding preserved — proxy
/// tests use it to prove the path was forwarded without re-encoding.</param>
public sealed record RecordedRequest(
    string Method,
    string Path,
    string Query,
    string? Authorization,
    string Body,
    IReadOnlyDictionary<string, string[]> Headers,
    string RawTarget);

/// <summary>
/// A fake Kubernetes API server for tests: real Kestrel on <c>127.0.0.1</c> with a random port and <b>real TLS</b>
/// (an in-test CA, see <see cref="TestCertificateAuthority"/>), a route table the test configures, and a log of every
/// request received (QG-2: we test against this, never a real cluster).
/// </summary>
/// <remarks>
/// <para>Used by the probe client tests (T-0010), the connection-test endpoint tests (T-0020) and, in CP2, the proxy
/// tests (forwarded headers, paths, streaming). Routes can be changed while the server runs.</para>
/// <para>Routes match on method + exact path (<see cref="Map"/>), then on the longest matching path prefix
/// (<see cref="MapPrefix"/>). A <c>GET</c> with <c>?watch=</c> on a path registered by <see cref="MapWatch"/> is
/// answered by its <see cref="WatchStream"/> before any other route. Unmatched requests get a Kubernetes-style 404
/// <c>Status</c> object.
/// Built-in helpers script the calls the connection test makes (<see cref="MapVersion"/>,
/// <see cref="MapSelfSubjectReview"/>, <see cref="MapClusterVersion"/>, <see cref="SetAccessReview"/>,
/// <see cref="MapRulesReview"/>); <see cref="Map"/> covers anything else.</para>
/// <para>Typical use: <c>await using var server = await FakeKubeApiServer.StartAsync();</c> then connect to
/// <see cref="BaseAddress"/> with <see cref="CaBundlePem"/> as the CA bundle.</para>
/// </remarks>
public sealed class FakeKubeApiServer : IAsyncDisposable
{
    /// <summary>Path of the SelfSubjectAccessReview endpoint.</summary>
    public const string AccessReviewsPath = "/apis/authorization.k8s.io/v1/selfsubjectaccessreviews";

    /// <summary>Path of the SelfSubjectRulesReview endpoint.</summary>
    public const string RulesReviewsPath = "/apis/authorization.k8s.io/v1/selfsubjectrulesreviews";

    /// <summary>Path of the SelfSubjectReview endpoint.</summary>
    public const string SelfSubjectReviewsPath = "/apis/authentication.k8s.io/v1/selfsubjectreviews";

    /// <summary>Path of the OpenShift ClusterVersion singleton.</summary>
    public const string ClusterVersionPath = "/apis/config.openshift.io/v1/clusterversions/version";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly WebApplication _app;
    private readonly TestCertificateAuthority _authority;
    private readonly X509Certificate2 _serverCertificate;
    private readonly ConcurrentDictionary<(string Method, string Path), RequestDelegate> _routes = new();
    private readonly ConcurrentDictionary<(string Method, string Prefix), RequestDelegate> _prefixRoutes = new();
    private readonly ConcurrentDictionary<string, WatchStream> _watches = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<(string Method, string Path), TimeSpan> _delays = new();

    // Cancelled on dispose, so held-open watches and delayed answers don't make Kestrel's graceful stop wait.
    private readonly CancellationTokenSource _stopping = new();
    private readonly ConcurrentDictionary<(string Verb, string Group, string Resource, string Subresource, string Namespace), (bool Allowed, string? Reason)> _accessReviews = new();
    private readonly ConcurrentQueue<RecordedRequest> _requests = new();
    private readonly ConcurrentQueue<string> _serverNames = new();

    private FakeKubeApiServer(WebApplication app, TestCertificateAuthority authority, X509Certificate2 serverCertificate)
    {
        _app = app;
        _authority = authority;
        _serverCertificate = serverCertificate;
        _routes[("POST", AccessReviewsPath)] = AnswerAccessReviewAsync;
    }

    /// <summary><c>https://127.0.0.1:{port}/</c>, the API URL clients connect to.</summary>
    public Uri BaseAddress { get; private set; } = null!;

    /// <summary>PEM of the CA that issued the server certificate: the CA bundle that makes TLS validation succeed.</summary>
    public string CaBundlePem => _authority.CertificatePem;

    /// <summary>Every request received so far, in arrival order.</summary>
    public IReadOnlyList<RecordedRequest> Requests => [.. _requests];

    /// <summary>
    /// The TLS SNI name of every handshake so far, in order; empty string when the client sent none (clients send none
    /// for an IP literal such as <see cref="BaseAddress"/>). Lets proxy tests prove the TLS name comes from the API URL,
    /// never from the browser's <c>Host</c> (T-0109).
    /// </summary>
    public IReadOnlyList<string> ServerNames => [.. _serverNames];

    /// <summary>Starts a server presenting <paramref name="certificate"/>.</summary>
    /// <param name="certificate">Which server certificate to present.</param>
    /// <param name="cancellationToken">Cancels startup.</param>
    /// <returns>The running server; dispose it to stop.</returns>
    public static async Task<FakeKubeApiServer> StartAsync(
        FakeServerCertificate certificate = FakeServerCertificate.Valid, CancellationToken cancellationToken = default)
    {
        var authority = new TestCertificateAuthority();
        var now = DateTimeOffset.UtcNow;
        var serverCertificate = certificate switch
        {
            FakeServerCertificate.Expired => authority.IssueServerCertificate(notBefore: now.AddDays(-10), notAfter: now.AddDays(-1)),
            FakeServerCertificate.WrongHost => authority.IssueServerCertificate(dnsNames: ["wrong-host.example"], ipAddresses: []),
            _ => authority.IssueServerCertificate(),
        };

        FakeKubeApiServer? server = null; // assigned before StartAsync, so before the first handshake reads it
        var builder = WebApplication.CreateSlimBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(kestrel =>
            kestrel.Listen(IPAddress.Loopback, 0, listen =>
            {
                listen.Protocols = HttpProtocols.Http1AndHttp2;
                // A selector instead of a fixed certificate, only to record the SNI name of every handshake (T-0109).
                listen.UseHttps(new HttpsConnectionAdapterOptions
                {
                    ServerCertificateSelector = (_, serverName) =>
                    {
                        server!._serverNames.Enqueue(serverName ?? string.Empty);
                        return serverCertificate;
                    },
                });
            }));

        var app = builder.Build();
        server = new FakeKubeApiServer(app, authority, serverCertificate);
        app.UseWebSockets(); // upgrades (exec/attach/port-forward) are answered by Map handlers via context.WebSockets
        app.Run(server.HandleAsync);

        await app.StartAsync(cancellationToken).ConfigureAwait(false);
        var address = app.Urls.Single();
        var port = new Uri(address).Port;
        server.BaseAddress = new Uri($"https://127.0.0.1:{port}/");
        return server;
    }

    /// <summary>Sets (or replaces) the handler for <paramref name="method"/> + <paramref name="path"/>.</summary>
    /// <param name="method">HTTP method, e.g. <c>GET</c>.</param>
    /// <param name="path">Exact path, e.g. <c>/version</c>.</param>
    /// <param name="handler">Writes the response.</param>
    public void Map(string method, string path, RequestDelegate handler) =>
        _routes[(method.ToUpperInvariant(), path)] = handler;

    /// <summary>
    /// Sets (or replaces) the handler for every <paramref name="method"/> request whose path starts with
    /// <paramref name="pathPrefix"/> (ordinal). Exact routes (<see cref="Map"/>) win; among prefixes the longest wins.
    /// </summary>
    /// <param name="method">HTTP method, e.g. <c>GET</c>.</param>
    /// <param name="pathPrefix">Path prefix, e.g. <c>/api/v1/namespaces/</c>.</param>
    /// <param name="handler">Writes the response.</param>
    public void MapPrefix(string method, string pathPrefix, RequestDelegate handler) =>
        _prefixRoutes[(method.ToUpperInvariant(), pathPrefix)] = handler;

    /// <summary>
    /// Answers <c>GET <paramref name="path"/>?watch=…</c> with a held-open, chunked <c>200</c> the test feeds through
    /// the returned <see cref="WatchStream"/>. Non-watch requests to the same path use the normal routes (so a list and
    /// a watch can be scripted side by side). Calling it again for the same path returns the same stream.
    /// </summary>
    /// <param name="path">Exact path, e.g. <c>/api/v1/namespaces/default/pods</c>.</param>
    /// <returns>The stream that writes events to the connected client.</returns>
    public WatchStream MapWatch(string path) => _watches.GetOrAdd(path, _ => new WatchStream(_stopping.Token));

    /// <summary>
    /// Answers <paramref name="method"/> + <paramref name="path"/> with a fixed status, extra response headers (e.g.
    /// <c>Set-Cookie</c>, <c>WWW-Authenticate</c> — for tests that the proxy strips or passes them) and a JSON body.
    /// </summary>
    /// <param name="method">HTTP method.</param>
    /// <param name="path">Exact path.</param>
    /// <param name="status">Status to return.</param>
    /// <param name="headers">Response headers to set. A <c>Content-Type</c> here is overwritten with
    /// <c>application/json</c>, as the body is always JSON; use <see cref="Map"/> for other content types.</param>
    /// <param name="body">Object serialized as JSON (camelCase), or <see langword="null"/> for a Kubernetes <c>Status</c>.</param>
    public void RespondWithHeaders(string method, string path, int status, IDictionary<string, string> headers, object? body = null)
    {
        var copy = new Dictionary<string, string>(headers, StringComparer.OrdinalIgnoreCase);
        Map(method, path, context =>
        {
            foreach (var (name, value) in copy)
            {
                context.Response.Headers.Append(name, value);
            }

            return WriteJsonAsync(context, status, body ?? StatusObject(status));
        });
    }

    /// <summary>
    /// Holds every <paramref name="method"/> + <paramref name="path"/> request for <paramref name="delay"/> before it
    /// is routed as usual — for timeout tests. The wait ends early (without a response) when the client aborts.
    /// </summary>
    /// <param name="method">HTTP method.</param>
    /// <param name="path">Exact path.</param>
    /// <param name="delay">How long to wait before answering.</param>
    public void Delay(string method, string path, TimeSpan delay) => _delays[(method.ToUpperInvariant(), path)] = delay;

    /// <summary>Sets a GET handler.</summary>
    /// <param name="path">Exact path.</param>
    /// <param name="handler">Writes the response.</param>
    public void MapGet(string path, RequestDelegate handler) => Map("GET", path, handler);

    /// <summary>Answers <paramref name="method"/> + <paramref name="path"/> with a fixed status and JSON body.</summary>
    /// <param name="method">HTTP method.</param>
    /// <param name="path">Exact path.</param>
    /// <param name="statusCode">Status to return.</param>
    /// <param name="body">Object serialized as JSON (camelCase), or <see langword="null"/> for a Kubernetes <c>Status</c>.</param>
    public void Respond(string method, string path, int statusCode, object? body = null) =>
        Map(method, path, context => WriteJsonAsync(context, statusCode, body ?? StatusObject(statusCode)));

    /// <summary>Scripts <c>GET /version</c>.</summary>
    /// <param name="gitVersion">The <c>gitVersion</c> to report.</param>
    public void MapVersion(string gitVersion = "v1.31.4") =>
        Respond("GET", "/version", 200, new { major = "1", minor = "31", gitVersion, platform = "linux/amd64" });

    /// <summary>Scripts the SelfSubjectReview answer.</summary>
    /// <param name="username">Authenticated user name.</param>
    /// <param name="groups">The user's groups.</param>
    public void MapSelfSubjectReview(string username, params string[] groups) =>
        Respond("POST", SelfSubjectReviewsPath, 201, new
        {
            apiVersion = "authentication.k8s.io/v1",
            kind = "SelfSubjectReview",
            status = new { userInfo = new { username, uid = "4c1f5b0e-0000-4000-8000-000000000001", groups } },
        });

    /// <summary>Scripts the OpenShift ClusterVersion.</summary>
    /// <param name="version"><c>status.desired.version</c>.</param>
    /// <param name="progressing">Status of the <c>Progressing</c> condition.</param>
    public void MapClusterVersion(string version = "4.17.3", bool progressing = false) =>
        Respond("GET", ClusterVersionPath, 200, new
        {
            apiVersion = "config.openshift.io/v1",
            kind = "ClusterVersion",
            metadata = new { name = "version" },
            status = new
            {
                desired = new { version, image = "quay.io/openshift-release-dev/ocp-release@sha256:0" },
                conditions = new[]
                {
                    new { type = "Available", status = "True" },
                    new { type = "Progressing", status = progressing ? "True" : "False" },
                },
            },
        });

    /// <summary>
    /// Scripts the SelfSubjectAccessReview answer for one attribute set. Unscripted reviews are denied (allowed=false),
    /// like an RBAC authorizer with no matching rule. Matching is exact; use <c>*</c> only where the client sends it.
    /// </summary>
    /// <param name="verb">Verb.</param>
    /// <param name="group">API group (empty = core).</param>
    /// <param name="resource">Resource.</param>
    /// <param name="allowed">The answer.</param>
    /// <param name="reason">Optional reason text.</param>
    /// <param name="subresource">Subresource, if any.</param>
    /// <param name="namespaceName">Namespace, if any.</param>
    public void SetAccessReview(
        string verb, string group, string resource, bool allowed, string? reason = null, string? subresource = null, string? namespaceName = null) =>
        _accessReviews[(verb, group, resource, subresource ?? "", namespaceName ?? "")] = (allowed, reason);

    /// <summary>Scripts the SelfSubjectRulesReview answer (any namespace).</summary>
    /// <param name="incomplete"><c>status.incomplete</c>.</param>
    /// <param name="evaluationError"><c>status.evaluationError</c>.</param>
    /// <param name="rules">Resource rules as (verbs, apiGroups, resources, resourceNames).</param>
    public void MapRulesReview(bool incomplete, string? evaluationError, params (string[] Verbs, string[] ApiGroups, string[] Resources, string[] ResourceNames)[] rules) =>
        Respond("POST", RulesReviewsPath, 201, new
        {
            apiVersion = "authorization.k8s.io/v1",
            kind = "SelfSubjectRulesReview",
            status = new
            {
                resourceRules = rules.Select(rule => new { verbs = rule.Verbs, apiGroups = rule.ApiGroups, resources = rule.Resources, resourceNames = rule.ResourceNames }),
                nonResourceRules = Array.Empty<object>(),
                incomplete,
                evaluationError,
            },
        });

    /// <summary>Stops the server and disposes the certificates.</summary>
    /// <returns>A task that completes when the server has stopped.</returns>
    public async ValueTask DisposeAsync()
    {
        await _stopping.CancelAsync().ConfigureAwait(false);
        await _app.StopAsync().ConfigureAwait(false);
        await _app.DisposeAsync().ConfigureAwait(false);
        _serverCertificate.Dispose();
        _authority.Dispose();
        _stopping.Dispose();
    }

    private async Task HandleAsync(HttpContext context)
    {
        var request = context.Request;
        using var reader = new StreamReader(request.Body);
        var body = await reader.ReadToEndAsync(context.RequestAborted).ConfigureAwait(false);
        var path = request.Path.Value ?? "";
        var headers = request.Headers.ToDictionary(
            header => header.Key, header => header.Value.Select(value => value ?? "").ToArray(), StringComparer.OrdinalIgnoreCase);
        _requests.Enqueue(new RecordedRequest(
            request.Method, path, request.QueryString.Value ?? "",
            request.Headers.Authorization.Count > 0 ? request.Headers.Authorization.ToString() : null, body,
            headers, context.Features.Get<IHttpRequestFeature>()?.RawTarget ?? path + request.QueryString.Value));

        // Handlers that need the body (access reviews) read it again from here.
        context.Items[BodyItemKey] = body;

        if (_delays.TryGetValue((request.Method, path), out var delay))
        {
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted, _stopping.Token);
            try
            {
                await Task.Delay(delay, linked.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                // The client gave up (the timeout under test) or the server is stopping: nobody reads an answer.
                return;
            }
        }

        if (HttpMethods.IsGet(request.Method) && request.Query.ContainsKey("watch") && _watches.TryGetValue(path, out var watch))
        {
            await watch.ServeAsync(context).ConfigureAwait(false);
            return;
        }

        var handler = FindHandler(request.Method, path);
        if (handler is not null)
        {
            await handler(context).ConfigureAwait(false);
            return;
        }

        await WriteJsonAsync(context, 404, StatusObject(404)).ConfigureAwait(false);
    }

    /// <summary>Exact route first, then the longest prefix route for the method; null when nothing matches.</summary>
    private RequestDelegate? FindHandler(string method, string path)
    {
        if (_routes.TryGetValue((method, path), out var exact))
        {
            return exact;
        }

        return _prefixRoutes
            .Where(route => route.Key.Method == method && path.StartsWith(route.Key.Prefix, StringComparison.Ordinal))
            .OrderByDescending(route => route.Key.Prefix.Length)
            .Select(route => route.Value)
            .FirstOrDefault();
    }

    private const string BodyItemKey = "fake-kube-apiserver.body";

    private Task AnswerAccessReviewAsync(HttpContext context)
    {
        var body = (string)context.Items[BodyItemKey]!;
        using var document = JsonDocument.Parse(body);
        var attributes = document.RootElement.GetProperty("spec").GetProperty("resourceAttributes");
        string Read(string name) => attributes.TryGetProperty(name, out var value) ? value.GetString() ?? "" : "";

        var key = (Read("verb"), Read("group"), Read("resource"), Read("subresource"), Read("namespace"));
        var (allowed, reason) = _accessReviews.TryGetValue(key, out var answer) ? answer : (false, null);
        return WriteJsonAsync(context, 201, new
        {
            apiVersion = "authorization.k8s.io/v1",
            kind = "SelfSubjectAccessReview",
            spec = new { resourceAttributes = JsonSerializer.Deserialize<object>(attributes.GetRawText()) },
            status = new { allowed, reason },
        });
    }

    private static object StatusObject(int statusCode) => new
    {
        kind = "Status",
        apiVersion = "v1",
        status = "Failure",
        message = $"fake-kube-apiserver: HTTP {statusCode}",
        code = statusCode,
    };

    private static async Task WriteJsonAsync(HttpContext context, int statusCode, object body)
    {
        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/json";
        await JsonSerializer.SerializeAsync(context.Response.Body, body, body.GetType(), Json, context.RequestAborted).ConfigureAwait(false);
    }
}
