using System.Net;
using System.Net.Http.Headers;
using FleetConsole.Api.Http;
using FleetConsole.Application.Proxy;
using FleetConsole.Application.Proxy.Requests;
using Microsoft.Net.Http.Headers;
using Yarp.ReverseProxy.Forwarder;

namespace FleetConsole.Api.Proxy;

/// <summary>
/// The header hardening and addressing of one proxied request (ADR-0020 §5–6). One instance per request: it holds the
/// authorized <see cref="ProxyTarget"/> (with the SA token) and the validated request, and records the upstream status
/// for the audit entry.
/// </summary>
/// <remarks>
/// <para><b>Request:</b> YARP's default copy (drops hop-by-hop headers but <em>keeps</em> the browser's <c>Host</c>, which
/// is therefore cleared so the API URL's authority is used — T-0109), then every header that could
/// carry the browser's identity or make the apiserver trust another one is removed — <c>Authorization</c>,
/// <c>Proxy-Authorization</c>, <c>Cookie</c>, <c>X-Console-Request</c>, <c>Forwarded</c>, <c>Impersonate-*</c>,
/// <c>X-Remote-*</c>, <c>X-Forwarded-*</c> — as is every header the client nominated as hop-by-hop in its
/// <c>Connection</c> header (RFC 9110 §7.6.1; <c>Upgrade</c> excepted, which YARP needs for WebSocket exec/attach),
/// and exactly one <c>Authorization: Bearer &lt;SA token&gt;</c> is set.
/// The destination is the cluster's API URL (path prefix kept) + the raw validated path + the query (watch
/// <c>timeoutSeconds</c> capped), built without canonicalization so the cluster receives the bytes that were validated.</para>
/// <para><b>Response:</b> an upstream 401 means the cluster rejected <em>our</em> credential; it is replaced by 502
/// <c>Proxy.CredentialRejected</c> so the SPA never treats it as its own session ending. Everything else is copied,
/// minus <c>Set-Cookie</c> and <c>WWW-Authenticate</c>. For streaming requests (watch, log follow; not protocol
/// upgrades) the status line and headers are sent to the client immediately, before the first body byte, so a quiet
/// watch is visibly open; non-streaming responses keep the default timing.</para>
/// </remarks>
/// <param name="target">The authorized cluster and the user's SA token.</param>
/// <param name="request">The validated, classified request.</param>
/// <param name="watchTimeoutCapSeconds">The <c>timeoutSeconds</c> cap for watches (<see cref="ProxyOptions.WatchTimeoutCapSeconds"/>).</param>
/// <param name="onSwitchingProtocols">
/// Awaited once with the upstream status when the cluster accepts a protocol upgrade (exec/attach), before YARP answers
/// the client and relays any frame, so the endpoint can write the session's audit entry at the handshake (ADR-0036 §3);
/// <see langword="null"/> for none.
/// </param>
internal sealed class KubernetesRequestTransformer(
    ProxyTarget target, ProxyRequest request, int watchTimeoutCapSeconds, Func<int, ValueTask>? onSwitchingProtocols = null)
    : HttpTransformer
{
    private static readonly string[] StrippedHeaders =
    [
        HeaderNames.Authorization,
        HeaderNames.ProxyAuthorization,
        HeaderNames.Cookie,
        CsrfHeaderMiddleware.HeaderName,
        "Forwarded",
    ];

    private static readonly string[] StrippedPrefixes = ["Impersonate-", "X-Remote-", "X-Forwarded-"];

    private static readonly UriCreationOptions RawUri = new() { DangerousDisablePathAndQueryCanonicalization = true };

    /// <summary>
    /// The status code the cluster answered with, or <see langword="null"/> if it never answered. Recorded as is in the
    /// audit entry (also 401, although the client got 502; CP2 contract §5).
    /// </summary>
    public int? UpstreamStatusCode { get; private set; }

    /// <summary>The URL the request is sent to: API URL (without trailing <c>/</c>) + raw path + forwarded query.</summary>
    /// <returns>The destination URI, not canonicalized.</returns>
    public Uri BuildDestination()
    {
        var apiUrl = target.Connection.ApiUrl.AbsoluteUri.TrimEnd('/');
        return new Uri(apiUrl + request.Path.Value + request.ForwardedQueryString(watchTimeoutCapSeconds), RawUri);
    }

    /// <inheritdoc />
    public override async ValueTask TransformRequestAsync(
        HttpContext httpContext, HttpRequestMessage proxyRequest, string destinationPrefix, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(proxyRequest);

        await base.TransformRequestAsync(httpContext, proxyRequest, destinationPrefix, cancellationToken).ConfigureAwait(false);

        // The default copy keeps the browser's Host (the console route). SocketsHttpHandler takes the TLS SNI and the
        // certificate name it validates from an explicit Host header, so kube-apiserver would see an unknown SNI, serve
        // its default (service-network) cert and fail our name check. Null = Host derived from RequestUri (T-0109).
        proxyRequest.Headers.Host = null;

        var nominated = ConnectionNominated(httpContext);
        Strip(proxyRequest.Headers, nominated);
        if (proxyRequest.Content is not null)
        {
            Strip(proxyRequest.Content.Headers, nominated);
        }

        proxyRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", target.Token.Reveal());
        proxyRequest.RequestUri = BuildDestination();
    }

    /// <inheritdoc />
    public override async ValueTask<bool> TransformResponseAsync(
        HttpContext httpContext, HttpResponseMessage? proxyResponse, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        if (proxyResponse is not null)
        {
            UpstreamStatusCode = (int)proxyResponse.StatusCode;
            if (proxyResponse.StatusCode == HttpStatusCode.Unauthorized)
            {
                // Not proxied: returning false makes YARP skip the body; our problem is the whole response.
                await ProxyProblems.WriteAsync(httpContext, ProxyErrors.CredentialRejected(target.ClusterName)).ConfigureAwait(false);
                return false;
            }

            // YARP calls this before it completes the client's handshake and starts relaying, so awaiting here means no
            // frame passes before the audit entry is written (ADR-0036 §3). A refusal (403/400/404 Status) is not an
            // accepted upgrade and is audited by the endpoint after SendAsync instead.
            if (onSwitchingProtocols is not null && IsAcceptedUpgrade(httpContext, proxyResponse))
            {
                await onSwitchingProtocols(UpstreamStatusCode.Value).ConfigureAwait(false);
            }
        }

        var proceed = await base.TransformResponseAsync(httpContext, proxyResponse, cancellationToken).ConfigureAwait(false);
        httpContext.Response.Headers.Remove(HeaderNames.SetCookie);
        httpContext.Response.Headers.Remove(HeaderNames.WWWAuthenticate);

        if (proceed && request.IsStreaming && !KubernetesProxyEndpoint.IsUpgradeRequest(httpContext))
        {
            // kube-apiserver flushes a watch's (or log follow's) status and headers at once, then may stay silent for
            // minutes. Without this the client only sees them with the first body bytes, so its fetch() stays pending
            // and the SPA can't tell a live watch from a stuck one (T-0090). An empty flush starts the response and
            // pushes the headers to the socket (StartAsync alone leaves them in Kestrel's output buffer). Upgrades are
            // left to YARP, which owns the handshake (the destination may even answer an HTTP/2 WebSocket with 200).
            // Once started, the endpoint no longer writes error problems (it checks Response.HasStarted).
            await httpContext.Response.Body.FlushAsync(cancellationToken).ConfigureAwait(false);
        }

        return proceed;
    }

    // 101 for an HTTP/1.1 Upgrade (kube-apiserver). While upgrades may still reach the cluster as an HTTP/2 extended
    // CONNECT (RFC 8441; pinning to HTTP/1.1 is T-0091), a 200 to that CONNECT is the same accepted handshake.
    private static bool IsAcceptedUpgrade(HttpContext httpContext, HttpResponseMessage proxyResponse) =>
        KubernetesProxyEndpoint.IsUpgradeRequest(httpContext)
        && (proxyResponse.StatusCode == HttpStatusCode.SwitchingProtocols
            || (proxyResponse.StatusCode == HttpStatusCode.OK && proxyResponse.RequestMessage?.Method == HttpMethod.Connect));

    // The header names the client listed in Connection (RFC 9110 §7.6.1): they apply to the client's hop only, and
    // YARP's default copy drops only its static hop-by-hop list. Upgrade stays: YARP forwards it for WebSocket
    // handshakes (exec/attach), and it is already one of the hop-by-hop headers YARP handles itself.
    private static HashSet<string> ConnectionNominated(HttpContext httpContext)
    {
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var value in httpContext.Request.Headers.Connection)
        {
            foreach (var token in (value ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (!string.Equals(token, HeaderNames.Upgrade, StringComparison.OrdinalIgnoreCase))
                {
                    names.Add(token);
                }
            }
        }

        return names;
    }

    private static void Strip(HttpHeaders headers, HashSet<string> nominated)
    {
        List<string>? remove = null;
        foreach (var (name, _) in headers.NonValidated)
        {
            if (IsStripped(name) || nominated.Contains(name))
            {
                (remove ??= []).Add(name);
            }
        }

        foreach (var name in remove ?? [])
        {
            headers.Remove(name);
        }
    }

    private static bool IsStripped(string name)
    {
        foreach (var header in StrippedHeaders)
        {
            if (string.Equals(name, header, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        foreach (var prefix in StrippedPrefixes)
        {
            if (name.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
