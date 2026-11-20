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
/// <para><b>Request:</b> YARP's default copy (drops hop-by-hop headers and <c>Host</c>), then every header that could
/// carry the browser's identity or make the apiserver trust another one is removed — <c>Authorization</c>,
/// <c>Proxy-Authorization</c>, <c>Cookie</c>, <c>X-Console-Request</c>, <c>Forwarded</c>, <c>Impersonate-*</c>,
/// <c>X-Remote-*</c>, <c>X-Forwarded-*</c> — and exactly one <c>Authorization: Bearer &lt;SA token&gt;</c> is set.
/// The destination is the cluster's API URL (path prefix kept) + the raw validated path + the query (watch
/// <c>timeoutSeconds</c> capped), built without canonicalization so the cluster receives the bytes that were validated.</para>
/// <para><b>Response:</b> an upstream 401 means the cluster rejected <em>our</em> credential; it is replaced by 502
/// <c>Proxy.CredentialRejected</c> so the SPA never treats it as its own session ending. Everything else is copied,
/// minus <c>Set-Cookie</c> and <c>WWW-Authenticate</c>.</para>
/// </remarks>
/// <param name="target">The authorized cluster and the user's SA token.</param>
/// <param name="request">The validated, classified request.</param>
/// <param name="watchTimeoutCapSeconds">The <c>timeoutSeconds</c> cap for watches (<see cref="ProxyOptions.WatchTimeoutCapSeconds"/>).</param>
internal sealed class KubernetesRequestTransformer(ProxyTarget target, ProxyRequest request, int watchTimeoutCapSeconds)
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

        Strip(proxyRequest.Headers);
        if (proxyRequest.Content is not null)
        {
            Strip(proxyRequest.Content.Headers);
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
        }

        var proceed = await base.TransformResponseAsync(httpContext, proxyResponse, cancellationToken).ConfigureAwait(false);
        httpContext.Response.Headers.Remove(HeaderNames.SetCookie);
        httpContext.Response.Headers.Remove(HeaderNames.WWWAuthenticate);
        return proceed;
    }

    private static void Strip(HttpHeaders headers)
    {
        List<string>? remove = null;
        foreach (var (name, _) in headers.NonValidated)
        {
            if (IsStripped(name))
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
