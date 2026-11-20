---
id: T-0061
title: Kubernetes proxy endpoint — YARP forwarding, header transforms, error mapping, audit wiring
status: todo
owner: backend-engineer
checkpoint: 2
depends_on: [T-0057, T-0058, T-0059, T-0060]
paths: [src/FleetConsole.Api/Proxy/, src/FleetConsole.Api/Endpoints/ApiEndpoints.cs, src/FleetConsole.Api/Endpoints/ClustersEndpoints.cs, src/FleetConsole.Api/Program.cs, src/FleetConsole.Api/appsettings.json, src/FleetConsole.Api/FleetConsole.Api.csproj, Directory.Packages.props, tests/FleetConsole.Api.Tests/Integration/Proxy/]
review_rounds: 0
---

## Goal
Ship `ANY /api/clusters/{cluster}/k8s/{**path}` (PRX-1): a thin adapter that validates the raw path, authorizes via
`AuthorizeProxyRequestQuery`, forwards with YARP `IHttpForwarder` over the cluster's pooled invoker with header
hardening, maps failures to `Proxy.*` ProblemDetails and audits mutations. Contract: `docs/specs/CP2-api-contract.md`
§1–4, §7. Joins all lanes.

## Scope
- In: `Api/Proxy/*`, YARP package (`Yarp.ReverseProxy`, latest 2.x supporting .NET 10 — central version), options
  binding, mapping, integration tests for the behaviours listed below.
- Folded CP1 nit (T-0019): `ClustersEndpoints.MapClustersEndpoints` — `ArgumentNullException.ThrowIfNull(api)`.
- Out: matrix/leak-sweep/revocation/TLS-isolation suites (T-0062), FE, WebSocket exec UI (CP4).

## Contract / design notes
ADR-0019 (order, raw path, origin), ADR-0020 (transforms, timeouts, error mapping), ADR-0021 (audit timing).
```
Api/Proxy/
  ProxySetup.cs                    // AddKubernetesProxy(this WebApplicationBuilder): AddHttpForwarder(); AddOptions<ProxyOptions>()
                                   //   .BindConfiguration("Proxy") + validator (timeouts > 0, cap whole seconds ≥ 1, max bytes > 0) .ValidateOnStart()
  KubernetesProxyEndpoint.cs       // MapKubernetesProxy(this IEndpointRouteBuilder api): api.Map("/clusters/{cluster}/k8s/{**path}", HandleAsync)
                                   //   .ExcludeFromDescription()   (inherits /api RequireAuthorization)
  KubernetesRequestTransformer.cs  // HttpTransformer, one instance per request (holds ProxyTarget + forwarded path/query); exposes int? UpstreamStatusCode
  ProxyProblems.cs                 // StatusOf(code) table + WriteAsync(HttpContext, Error) via IProblemDetailsService (code + traceId like CsrfHeaderMiddleware)
  ForwarderErrorMapper.cs          // (ForwarderError, Exception?, cluster) → Error? (null = client gone, write nothing)
  ProxyLog.cs                      // [LoggerMessage] 2400 audit write failed (Error), 2401 forward failed (Warning: method, cluster, path w/o query, error kind)
```
`HandleAsync(HttpContext ctx, string cluster, IDispatcher, IHttpForwarder, IClusterForwardingClients, IOptions<ProxyOptions>, IOptions<PublicOriginOptions>, ILogger<…>)`:
1. `ctx.Features.Get<IStatusCodePagesFeature>()?.Enabled = false`.
2. Raw path = `IHttpRequestFeature.RawTarget` up to `?`, minus the first 4 segments (`api/clusters/<c>/k8s`); query =
   raw remainder (`""` or `?…`). `ProxyPath.TryParse` fails → 400 `Proxy.PathNotAllowed`. (Assume empty `PathBase`; assert it.)
3. Upgrade request (`IHttpUpgradeFeature.IsUpgradableRequest` or `ctx.WebSockets.IsWebSocketRequest`) with `Origin` ≠
   `PublicOriginOptions.GetOrigin()` → 403 `Proxy.OriginNotAllowed`.
4. `request = ProxyRequest.Create(method, path, query, isUpgrade, ctx.Request.ContentLength)`.
5. Dispatch `AuthorizeProxyRequestQuery(cluster, request)`. Failure → if `request.IsMutation` audit `Denied`
   (code→reason: NotAvailable→NoAccess, UserReadOnly, ReadOnlyGrant, BodyTooLarge) with the problem's status → write problem.
6. `TryGetInvoker` false → 502 `Proxy.UpstreamTls` (+ audit Allowed/502 if mutation).
7. If the request can have a body: `IHttpMaxRequestBodySizeFeature` (if present and not read-only) =
   `MaxMutationBodyBytes`.
8. `ForwarderRequestConfig { ActivityTimeout = request.IsStreaming ? StreamIdleTimeout : RequestTimeout }`;
   `await forwarder.SendAsync(ctx, target.Connection.ApiUrl.ToString(), invoker, config, transformer)`.
9. Error ≠ None and `!ctx.Response.HasStarted` → mapped problem (413 from a Kestrel `BadHttpRequestException` 413 →
   `BodyTooLarge`, audited Denied). Response started → nothing to write (YARP aborts).
10. Mutation → audit (`UpstreamStatusCode ?? (error→502/504) ?? 0`). Audit call: `CancellationToken.None`,
    `try/catch (Exception)` → log 2400 at Error, never rethrow (PAUD-3).

Transformer (ADR-0020 §5–6): `TransformRequestAsync` → `base` then remove `Authorization`, `Proxy-Authorization`,
`Cookie`, `X-Console-Request`, `Forwarded` and prefixes `Impersonate-`, `X-Remote-`, `X-Forwarded-`
(OrdinalIgnoreCase, over both `proxyRequest.Headers` and `Content.Headers`), add `Authorization: Bearer <token>`; set
`RequestUri` = ApiUrl (keep its path prefix, trim trailing `/`) + raw path + `request.ForwardedQueryString(cap)`, built
with `new Uri(s, new UriCreationOptions { DangerousDisablePathAndQueryCanonicalization = true })` so the validated
bytes are forwarded unchanged. `TransformResponseAsync` → record status; 401 → write 502 `CredentialRejected`, return
`false`; else `base`, then remove `Set-Cookie`, `WWW-Authenticate` from `ctx.Response.Headers`.
Config in `appsettings.json`: `"Proxy": { "RequestTimeout": "00:00:30", "WatchTimeoutCap": "00:05:00", "MaxMutationBodyBytes": 10485760 }`.
Update BACKEND.md only if you deviate (then say so in the work log).

## Context pack
- Docs: `docs/specs/CP2-api-contract.md` (whole, short); ADR-0019/0020/0021; BACKEND.md § "The proxy" (L184-205) and L167-169 (status-code pages).
- ProblemDetails writing exemplar: `src/FleetConsole.Api/Http/CsrfHeaderMiddleware.cs:L41-60`; status table style: `src/FleetConsole.Api/Http/ResultExtensions.cs:L111-140`.
- Exception classification exemplar: `src/FleetConsole.Infrastructure/Kubernetes/ClusterProbeSession.cs:L249-290` (`HttpRequestError`, `SocketError`, `AuthenticationException`).
- Mapping site: `src/FleetConsole.Api/Endpoints/ApiEndpoints.cs:L28-45`; registration: `src/FleetConsole.Api/Program.cs:L18-41`; origin: `src/FleetConsole.Api/Hosting/PublicOriginOptions.cs:GetOrigin` and options pattern `L83-100`.
- Ports from earlier tasks: `IClusterForwardingClients.TryGetInvoker` (T-0058), `AuthorizeProxyRequestQuery`/`ProxyErrors`/`ProxyOptions` (T-0059), `RecordProxyAuditCommand` (T-0060), `ProxyPath`/`ProxyRequest` (T-0056).
- Tests: `ApiFactory.LoginAsAsync` (`Integration/ApiFactory.cs:L155`), `CreateVariantAsync` (`L105`) for small timeouts, `TestData.ProxyClusterAsync` + `FakeKubeApiServer.MapPrefix/MapWatch/RecordedRequest.Headers` (T-0057), `factory.Logs`.

## Acceptance criteria
- [ ] PRX-1: GET list, PUT with body, DELETE, PATCH reach the fake server with method, raw path, query and body unchanged; ApiUrl with a path prefix works; response status/body/`Content-Type` pass through; upstream 404/409/422 `Status` bodies untouched (status-code pages off).
- [ ] PRX-4: `/api/clusters/x/k8s/healthz`, `…/k8s/api/%2e%2e/x`, `…/k8s/api/v1/namespaces%2Fx` → 400 `Proxy.PathNotAllowed`, fake server saw nothing.
- [ ] PRX-5: upstream 401 → 502 `Proxy.CredentialRejected`, no `WWW-Authenticate`; upstream 403 passes through as 403 `Status`.
- [ ] PRX-6: stopped server → 502 `UpstreamUnavailable`; untrusted cert → 502 `UpstreamTls`; delayed response beyond a 1 s `RequestTimeout` (variant) → 504 `UpstreamTimeout`; no exception text in bodies.
- [ ] PRX-8 (basic): watch request forwarded with `timeoutSeconds` capped; one event arrives at the client while the stream is open.
- [ ] SEC-1/2: one test sends every listed header with a recognisable value; the fake sees exactly one `Authorization: Bearer <sa-token>` and none of the others; `Set-Cookie`/`WWW-Authenticate` from upstream absent in the client response.
- [ ] SEC-3: PUT without `X-Console-Request` → 403 `Auth.CsrfHeaderMissing`, nothing forwarded.
- [ ] MUT-2/3/5 at HTTP level (403 codes, 413 by `Content-Length`), nothing forwarded; SSAR POST with ReadOnly grant forwarded.
- [ ] PAUD-1/2 wiring: allowed PUT and denied DELETE each produce exactly one `proxy.*` entry; GET/watch/SSAR produce none.
- [ ] WebSocket-style upgrade request with a foreign `Origin` → 403 `Proxy.OriginNotAllowed` (if TestServer can't express upgrades, unit-test the check and note it).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
