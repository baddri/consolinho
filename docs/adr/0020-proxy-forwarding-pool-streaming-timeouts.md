# 0020 — Proxy forwarding: per-cluster invoker pool, header transforms, streaming watches, timeouts, error mapping
**Status:** Accepted (2026-11-20) · refines ADR-0003, ADR-0011 · CP2 spec PRX-5..8, SEC-1/2, Q5, Q6

## Context
YARP's `IHttpForwarder` needs an `HttpMessageInvoker` per destination. Each cluster has its own trust (CA bundle,
system trust or skip-verify, PRX-7) and admins may change it at any time. ADR-0011's `ClusterTlsHandlerFactory`
records TLS rejections in a per-handler `TlsValidationRecord`, which is only exact for short-lived probe sessions
(T-0010 follow-up). Watches must stream unbuffered (PRX-8) and honour revocation without an invalidation bus (Q6).

## Decision
1. **Pool port** `Application/Abstractions/Kubernetes/IClusterForwardingClients`:
   `bool TryGetInvoker(ClusterId, ClusterConnection, out HttpMessageInvoker?)` (false = unparsable CA bundle). Infrastructure
   `ClusterForwardingClientPool` (singleton, `IDisposable`) keeps one entry per cluster id holding the
   `ClusterConnection` it was built from. **The key check is value equality of `ClusterConnection`** (URL, CA PEM,
   skip flag): on mismatch the entry is replaced, so the next request after an admin edit uses the new settings with no
   event plumbing. The replaced handler is disposed after a grace period of `StreamIdleTimeout` (open watches finish);
   all handlers are disposed on shutdown. Deleted clusters leave a dead entry until restart (≤ 40, accepted).
2. **Handler**: `ClusterTlsHandlerFactory.CreateForwarding(ClusterConnection)` shares the trust setup with `Create`
   (extract a private `BuildSslOptions(connection, TlsValidationRecord? record)`) but records nothing. Forwarding
   settings per YARP guidance: `AllowAutoRedirect=false`, `UseCookies=false`,
   `AutomaticDecompression=None`, `EnableMultipleHttp2Connections=true`, `ConnectTimeout` 10 s,
   `PooledConnectionIdleTimeout` default. System proxy settings are honoured (same as probes).
3. **TLS errors are classified by exception, not by record**: `HttpRequestException.HttpRequestError ==
   SecureConnectionError` (or an inner `AuthenticationException`) → 502 `Proxy.UpstreamTls`; the detail names the
   cluster only. This retires the T-0010 follow-up: the proxy never needs the *kind* of TLS failure (the admin's
   connection test gives that). A stored CA bundle that fails to parse (`TryGetInvoker` → false) → `Proxy.UpstreamTls`.
4. **Error mapping** from `IForwarderErrorFeature` when the response has not started: `RequestTimedOut` → 504
   `Proxy.UpstreamTimeout`; `Request` with `NameResolutionError`/`ConnectionError`/socket errors → 502
   `Proxy.UpstreamUnavailable`; TLS as above; anything else upstream-side → 502 `Proxy.UpstreamUnavailable`;
   client-side cancellation → no body (client is gone). Once the response has started, the connection is aborted.
   Details never contain exception messages (they can echo URLs/headers).
5. **Request transform** (`KubernetesRequestTransformer : HttpTransformer`): calls the default (hop-by-hop removal),
   then removes `Authorization`, `Proxy-Authorization`, `Cookie`, `X-Console-Request`, `Forwarded`, and every header
   starting with `Impersonate-`, `X-Remote-`, `X-Forwarded-` (case-insensitive), then sets exactly one
   `Authorization: Bearer <token>`. Destination URI = cluster `ApiUrl` (its path prefix kept, as in
   `ClusterProbeClient`) + validated raw path + query. For watches the query's `timeoutSeconds` is set to
   `min(requested, cap)` (added when absent). `Host` is the upstream's.
6. **Response transform**: default copy, then remove `Set-Cookie` and `WWW-Authenticate`. **Upstream 401** is not
   proxied: the transformer writes 502 `Proxy.CredentialRejected` and returns `false` (body not copied), so the SPA never
   logs the user out. 403 and every other status pass through untouched. The proxy request disables
   `IStatusCodePagesFeature` so upstream 4xx bodies are not replaced.
7. **Timeouts** (`Proxy:*`, `ProxyOptions`): non-streaming requests use `ForwarderRequestConfig.ActivityTimeout =
   RequestTimeout` (30 s; YARP's timeout is an idle timeout — acceptable, a healthy apiserver never idles 30 s inside a
   response). Streaming requests use `StreamIdleTimeout = WatchTimeoutCap + 30 s`. `WatchTimeoutCap` (300 s) bounds
   every watch, so a revoked user's read stream ends ≤ 5 min after revocation (Q6). Mutation body limit
   `MaxMutationBodyBytes` (10 MiB): `Content-Length` is checked by `RequestBodyLimitPolicy`; chunked bodies are capped
   by setting `IHttpMaxRequestBodySizeFeature.MaxRequestBodySize` (Kestrel → 413 while reading; the feature is absent
   under TestServer, where only the `Content-Length` path is tested).
8. **Watch transport (Q5)**: plain HTTP chunked watch (`?watch=1&resourceVersion=…&allowWatchBookmarks=true`) read
   with `fetch` streaming. No WebSocket, no server-side fan-out. YARP flushes each chunk as it arrives; no response
   buffering or compression middleware may be added to `/api/clusters/*/k8s`.
9. **Observability**: proxy logs/traces carry method, cluster, *path without query*, status and duration — never
   headers or bodies. The upstream `HttpClient` activity is allowed (it records `url.full`; the token is in a header).

## Consequences
- Admin edits take effect on the next request without an invalidation mechanism; cost is one record comparison per request.
- `TlsValidationRecord` stays probe-only; its CP2 caveat in the remarks is resolved by this ADR (update the comment).
- Response bodies/headers from the cluster other than the two stripped headers are passed through unscanned; the
  token-leak sweep covers what *FleetConsole* produces (ProblemDetails, audit, logs, our headers).
