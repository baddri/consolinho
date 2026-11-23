using FleetConsole.Api.Hosting;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Proxy;
using FleetConsole.Application.Proxy.AuthorizeProxyRequest;
using FleetConsole.Application.Proxy.RecordProxyAudit;
using FleetConsole.Application.Proxy.Requests;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Options;
using Microsoft.Net.Http.Headers;
using Yarp.ReverseProxy.Forwarder;

namespace FleetConsole.Api.Proxy;

/// <summary>
/// <c>ANY /api/clusters/{cluster}/k8s/{**path}</c> (PRX-1): forwards a Kubernetes API request to the cluster with the
/// ServiceAccount token the signed-in user was granted for it. A thin adapter — the decisions live elsewhere: path
/// validation and classification in <see cref="ProxyPath"/>/<see cref="ProxyRequest"/>, access and mutation policies in
/// <see cref="AuthorizeProxyRequestQuery"/>, header hardening in <see cref="KubernetesRequestTransformer"/>, error
/// mapping in <see cref="ForwarderErrorMapper"/>, the audit entry in <see cref="RecordProxyAuditCommand"/>.
/// </summary>
/// <remarks>
/// <para>Check order (ADR-0019 §1): CSRF and session run before the endpoint (middleware, <c>/api</c> group policy);
/// then raw path (400) → WebSocket <c>Origin</c> (403) → authorization query (404, 403, 413) → forward.</para>
/// <para>The route is not part of the OpenAPI document (it is a passthrough; CP2 contract). Bodies are streamed in
/// both directions by YARP; nothing here may buffer them (watches and logs are long-lived streams).</para>
/// </remarks>
public static class KubernetesProxyEndpoint
{
    /// <summary>The route below <c>/api</c>.</summary>
    public const string Pattern = "/clusters/{cluster}/k8s/{**path}";

    // The raw target starts with "/api/clusters/<cluster>/k8s" (PathBase is empty, see HandleAsync): 4 segments.
    private const int PrefixSegments = 4;

    /// <summary>Maps the proxy route into the <c>/api</c> group, inheriting its authenticated-session requirement.</summary>
    /// <param name="api">The <c>/api</c> route group.</param>
    /// <returns>The endpoint's convention builder.</returns>
    public static RouteHandlerBuilder MapKubernetesProxy(this IEndpointRouteBuilder api)
    {
        ArgumentNullException.ThrowIfNull(api);
        return api.Map(Pattern, HandleAsync).ExcludeFromDescription();
    }

    /// <summary>Validates, authorizes, forwards and audits one request.</summary>
    /// <param name="context">The incoming request.</param>
    /// <param name="cluster">The cluster name from the route (validated by the authorization query).</param>
    /// <param name="dispatcher">Runs the authorization query and the audit command in the request scope.</param>
    /// <param name="forwarder">YARP's forwarder.</param>
    /// <param name="clients">The per-cluster invoker pool.</param>
    /// <param name="options">Timeouts and body limit.</param>
    /// <param name="publicOrigin">The console's public origin, for the WebSocket <c>Origin</c> check.</param>
    /// <param name="time">Runs the stream lifetime timer (ADR-0036 §1).</param>
    /// <param name="loggerFactory">Creates the proxy logger.</param>
    /// <returns>A task that completes when the response has been written.</returns>
    internal static async Task HandleAsync(
        HttpContext context,
        string cluster,
        IDispatcher dispatcher,
        IHttpForwarder forwarder,
        IClusterForwardingClients clients,
        IOptions<ProxyOptions> options,
        IOptions<PublicOriginOptions> publicOrigin,
        TimeProvider time,
        ILoggerFactory loggerFactory)
    {
        // Upstream 4xx/5xx bodies (Kubernetes Status objects) must reach the client untouched (BACKEND.md).
        if (context.Features.Get<IStatusCodePagesFeature>() is { } statusCodePages)
        {
            statusCodePages.Enabled = false;
        }

        // The raw target includes PathBase; stripping exactly four segments is only right without one. The Api is
        // never hosted under a path base (it serves the SPA at /), so this is a configuration bug, not a client error.
        if (context.Request.PathBase.HasValue)
        {
            throw new InvalidOperationException("The Kubernetes proxy does not support a request PathBase.");
        }

        if (!TrySplitRawTarget(context.Features.Get<IHttpRequestFeature>()?.RawTarget, cluster, out var rawPath, out var query)
            || !ProxyPath.TryParse(rawPath, out var path))
        {
            await ProxyProblems.WriteAsync(context, ProxyErrors.PathNotAllowed).ConfigureAwait(false);
            return;
        }

        var isUpgrade = IsUpgradeRequest(context);
        if (isUpgrade && !string.Equals(context.Request.Headers.Origin, publicOrigin.Value.GetOrigin(), StringComparison.OrdinalIgnoreCase))
        {
            await ProxyProblems.WriteAsync(context, ProxyErrors.OriginNotAllowed).ConfigureAwait(false);
            return;
        }

        var request = ProxyRequest.Create(context.Request.Method, path, query, isUpgrade, context.Request.ContentLength);
        var settings = options.Value;
        var audit = new ProxyAudit(dispatcher, loggerFactory.CreateLogger(typeof(KubernetesProxyEndpoint).FullName!), cluster, request);

        var authorization = await dispatcher.Send(new AuthorizeProxyRequestQuery(cluster, request), context.RequestAborted)
            .ConfigureAwait(false);
        if (authorization.IsFailure)
        {
            var error = authorization.Error!;
            if (DenialReasonOf(error) is { } reason)
            {
                await audit.RecordAsync(ProxyProblems.StatusOf(error), reason).ConfigureAwait(false);
            }

            await ProxyProblems.WriteAsync(context, error).ConfigureAwait(false);
            return;
        }

        var target = authorization.Value;
        if (!clients.TryGetInvoker(target.ClusterId, target.Connection, out var invoker))
        {
            // The stored CA bundle doesn't parse: the cluster's certificate can't be verified (ADR-0020 §3).
            await audit.RecordAsync(StatusCodes.Status502BadGateway, reason: null).ConfigureAwait(false);
            await ProxyProblems.WriteAsync(context, ProxyErrors.UpstreamTls(target.ClusterName)).ConfigureAwait(false);
            return;
        }

        // Content-Length was checked by RequestBodyLimitPolicy; this caps chunked bodies while Kestrel streams them
        // (413 BadHttpRequestException → ForwarderErrorMapper). Absent under TestServer.
        if (context.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } bodySize)
        {
            bodySize.MaxRequestBodySize = settings.MaxMutationBodyBytes;
        }

        // Upgrades (exec/attach) are audited when the cluster accepts the handshake, before any frame is relayed, not
        // when the session ends up to ExecSessionCap later (ADR-0036 §3). The flag makes the post-SendAsync record a
        // no-op for them; a refused upgrade (RBAC 403, 400, 404) never sets it and is audited below like any request.
        var auditedAtHandshake = false;
        var sessionStart = 0L;
        Func<int, ValueTask>? onSwitchingProtocols = isUpgrade
            ? async upstreamStatus =>
            {
                auditedAtHandshake = true;
                sessionStart = time.GetTimestamp();
                await audit.RecordAsync(upstreamStatus, reason: null).ConfigureAwait(false);
            }
            : null;
        var transformer = new KubernetesRequestTransformer(target, request, settings.WatchTimeoutCapSeconds, onSwitchingProtocols);
        var lifetime = request.IsStreaming ? settings.StreamLifetime(isUpgrade) : (TimeSpan?)null;
        var config = new ForwarderRequestConfig
        {
            // YARP's timeout is an idle timeout. A stream's equals its hard lifetime (ADR-0036 §1): watches and followed
            // logs get the watch cap plus Proxy:StreamIdleSlack (ADR-0020 §7), upgrades the exec cap, so an idle
            // terminal isn't cut early.
            ActivityTimeout = lifetime ?? settings.RequestTimeout,
        };

        // Every stream gets a hard lifetime (ADR-0036 §1): YARP links its activity token to HttpContext.RequestAborted,
        // so swapping in a token that also fires at the lifetime makes YARP abort the response body or the upgraded
        // tunnel then. The client reconnects, which re-runs authorization: revocation takes effect at the cap (TERM-8).
        var clientAborted = context.RequestAborted;
        using var lifetimeTimer = lifetime is { } span ? new CancellationTokenSource(span, time) : null;
        using var linked = lifetimeTimer is null ? null : CancellationTokenSource.CreateLinkedTokenSource(clientAborted, lifetimeTimer.Token);

        // Decided when the timer fires, not after SendAsync: YARP's abort of the cut response also cancels the
        // connection's own token, so "client gone" can't be told apart afterwards. This relies on a
        // CancellationTokenSource running callbacks last-registered-first: this registration comes after the linked
        // source's, so the flag is set before the linked token (and with it YARP's abort) fires.
        var lifetimeReached = false;
        using var lifetimeWatch = lifetimeTimer?.Token.Register(() => lifetimeReached = !clientAborted.IsCancellationRequested);
        ForwarderError forwardError;
        try
        {
            if (linked is not null)
            {
                context.RequestAborted = linked.Token;
            }

            forwardError = await forwarder
                .SendAsync(context, target.Connection.ApiUrl.AbsoluteUri, invoker, config, transformer)
                .ConfigureAwait(false);
        }
        finally
        {
            // The linked source is disposed when the method returns; later readers must see the connection's own token.
            context.RequestAborted = clientAborted;
        }

        // The cap fired while the client was still there: an expected end, not a failure — no Warning, no problem body.
        if (lifetimeReached)
        {
            ProxyLog.StreamLifetimeReached(audit.Logger, request.Method, target.ClusterName, request.Path.Value);
        }

        Error? failure = null;
        if (forwardError != ForwarderError.None && !lifetimeReached)
        {
            var exception = context.GetForwarderErrorFeature()?.Exception;
            failure = ForwarderErrorMapper.Map(forwardError, exception, target.ClusterName, settings.MaxMutationBodyBytes);
            if (!ForwarderErrorMapper.IsClientSide(forwardError) || failure is not null)
            {
                ProxyLog.ForwardFailed(audit.Logger, request.Method, target.ClusterName, request.Path.Value, forwardError,
                    exception?.GetType().Name, (exception as HttpRequestException)?.HttpRequestError);
            }

            // Once the response has started YARP has already aborted it; there is nothing left to write.
            if (failure is not null && !context.Response.HasStarted)
            {
                await ProxyProblems.WriteAsync(context, failure).ConfigureAwait(false);
            }
        }

        if (auditedAtHandshake)
        {
            // One audit entry per request: the session's end is operational data, logged with its duration (ADR-0036 §4).
            var cause = lifetimeReached ? ExecSessionEndCause.Cap
                : clientAborted.IsCancellationRequested || ForwarderErrorMapper.IsClientSide(forwardError) ? ExecSessionEndCause.Client
                : ExecSessionEndCause.Upstream;
            var durationMs = (long)time.GetElapsedTime(sessionStart).TotalMilliseconds;
            ProxyLog.ExecSessionEnded(audit.Logger, target.ClusterName, request.Info.Namespace, request.Info.Name, request.Container,
                durationMs, cause);
        }
        else if (failure is { Code: "Proxy.BodyTooLarge" })
        {
            await audit.RecordAsync(StatusCodes.Status413PayloadTooLarge, ProxyDenialReason.BodyTooLarge).ConfigureAwait(false);
        }
        else
        {
            // Upstream status if the cluster answered, else 502/504 for our error, else 0 (client left first).
            var status = transformer.UpstreamStatusCode ?? (failure is null ? 0 : ProxyProblems.StatusOf(failure));
            await audit.RecordAsync(status, reason: null).ConfigureAwait(false);
        }
    }

    /// <summary>
    /// Whether the browser asked for a protocol upgrade (HTTP/1.1 <c>Upgrade</c> or an HTTP/2 extended-CONNECT
    /// WebSocket). Shared by the <c>Origin</c> check and <see cref="KubernetesRequestTransformer"/>, which must leave
    /// the upgrade handshake to YARP.
    /// </summary>
    /// <param name="context">The incoming request.</param>
    /// <returns><see langword="true"/> for an upgrade request.</returns>
    internal static bool IsUpgradeRequest(HttpContext context) =>
        context.Features.Get<IHttpUpgradeFeature>()?.IsUpgradableRequest == true || context.WebSockets.IsWebSocketRequest;

    /// <summary>
    /// Splits the raw request target into the forwarded path (everything after <c>/api/clusters/&lt;c&gt;/k8s</c>,
    /// still percent-encoded) and the raw query (<c>""</c> or starting with <c>?</c>).
    /// </summary>
    /// <remarks>
    /// The first four raw segments must be the ones routing matched (case-insensitive literals, the cluster equal to
    /// the route value once decoded). Routing works on the normalized path, so a raw target with dot segments or
    /// encoded separators in the prefix could otherwise route to one cluster while a different remainder is forwarded.
    /// Anything unexpected — including an absolute-form or empty target — fails, and the caller answers 400.
    /// </remarks>
    /// <param name="rawTarget">The request target as received (<see cref="IHttpRequestFeature.RawTarget"/>).</param>
    /// <param name="cluster">The routed cluster name.</param>
    /// <param name="path">The raw path to validate and forward; empty when nothing follows <c>/k8s</c>.</param>
    /// <param name="query">The raw query string.</param>
    /// <returns><see langword="true"/> when the target has the expected prefix.</returns>
    internal static bool TrySplitRawTarget(string? rawTarget, string cluster, out string path, out string query)
    {
        path = string.Empty;
        query = string.Empty;
        if (string.IsNullOrEmpty(rawTarget) || rawTarget[0] != '/')
        {
            return false;
        }

        var queryStart = rawTarget.IndexOf('?', StringComparison.Ordinal);
        var rawPath = queryStart < 0 ? rawTarget : rawTarget[..queryStart];

        // "", "api", "clusters", "<cluster>", "k8s", "<rest without leading />"
        var parts = rawPath.Split('/', PrefixSegments + 2);
        if (parts.Length < PrefixSegments + 1
            || !string.Equals(parts[1], "api", StringComparison.OrdinalIgnoreCase)
            || !string.Equals(parts[2], "clusters", StringComparison.OrdinalIgnoreCase)
            || !string.Equals(Uri.UnescapeDataString(parts[3]), cluster, StringComparison.Ordinal)
            || !string.Equals(parts[4], "k8s", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        path = parts.Length > PrefixSegments + 1 ? "/" + parts[PrefixSegments + 1] : string.Empty;
        query = queryStart < 0 ? string.Empty : rawTarget[queryStart..];
        return true;
    }

    // Authorization failures that are audited as denials (ADR-0021 §2); anything else (e.g. no session) is not.
    private static ProxyDenialReason? DenialReasonOf(Error error) => error.Code switch
    {
        ProxyErrors.NotAvailableCode => ProxyDenialReason.NoAccess,
        "Proxy.UserReadOnly" => ProxyDenialReason.UserReadOnly,
        "Proxy.ReadOnlyGrant" => ProxyDenialReason.ReadOnlyGrant,
        "Proxy.BodyTooLarge" => ProxyDenialReason.BodyTooLarge,
        _ => null,
    };

    /// <summary>
    /// Writes the audit entry of a proxied <b>mutation</b> (reads are never audited) in the request scope, so the actor
    /// is the signed-in user. Uses <see cref="CancellationToken.None"/> because the client may already be gone, and
    /// never throws: a failed audit write is logged at Error (EventId 2400) and the response stands (ADR-0021 §2, PAUD-3).
    /// </summary>
    private sealed class ProxyAudit(IDispatcher dispatcher, ILogger logger, string cluster, ProxyRequest request)
    {
        // Only a valid cluster name is stored; a malformed route value is recorded as "no cluster" (ADR-0021 §4).
        private readonly string? _clusterName = ClusterName.Create(cluster).IsSuccess ? cluster : null;

        public ILogger Logger => logger;

        public async Task RecordAsync(int statusCode, ProxyDenialReason? reason)
        {
            if (!request.IsMutation)
            {
                return;
            }

            var outcome = reason is null ? ProxyAuditOutcome.Allowed : ProxyAuditOutcome.Denied;
            var record = new ProxyAuditRecord(_clusterName, request, statusCode, outcome, reason);
            try
            {
                var result = await dispatcher.Send(new RecordProxyAuditCommand(record), CancellationToken.None).ConfigureAwait(false);
                if (result.IsFailure)
                {
                    ProxyLog.AuditFailed(logger, exception: null, request.Method, cluster, request.Path.Value, statusCode);
                }
            }
#pragma warning disable CA1031 // Auditing must never fail the proxied request (PAUD-3); every failure is logged at Error.
            catch (Exception exception)
#pragma warning restore CA1031
            {
                ProxyLog.AuditFailed(logger, exception, request.Method, cluster, request.Path.Value, statusCode);
            }
        }
    }
}
