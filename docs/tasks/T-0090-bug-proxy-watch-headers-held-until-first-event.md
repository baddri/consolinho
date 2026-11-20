---
id: T-0090
title: "label: bug — proxy holds watch response headers until the first event"
status: done
owner: backend-engineer
checkpoint: 2
depends_on: [T-0061]
paths: [src/FleetConsole.Api/Proxy/, tests/FleetConsole.Api.Tests/Integration/Proxy/ProxyKestrelTests.cs, tests/FleetConsole.Api.Tests/Integration/Proxy/ProxyStreamingAndAuditTests.cs]
review_rounds: 0
---

## Goal
Send the response status line and headers of a streamed request (watch, logs follow) to the client as soon as the
cluster sends them, not only with the first body bytes. Today a watch on a quiet resource leaves the browser's
`fetch()` pending until the first event or bookmark, which can be a minute or more. In that time the SPA can't tell a
working watch from one that is stuck, and an idle intermediary (router `timeout server`) may cut it before any byte arrives.

## Scope
- In: flush the response start for streaming requests in the proxy (suspected location
  `src/FleetConsole.Api/Proxy/KubernetesRequestTransformer.cs:TransformResponseAsync`: after the base transform and
  header stripping, when `request.IsStreaming` and the transform proceeds, `await httpContext.Response.StartAsync(ct)`
  (or flush the body)). Remove the `Skip` from the test below.
- Out: other buffering (event latency is fine: < 1 s, PRX-8).

## Contract / design notes
CP2 contract §3 (watches read with `fetch` + `ReadableStream`), PRX-8 ("streamed unbuffered").

## Repro
`ProxyKestrelTests.Watch_Response_Headers_Arrive_Before_The_First_Event` (currently `Skip = "T-0090 …"`). It runs on Kestrel
over sockets: the fake API server flushes `200` + headers at once (like kube-apiserver) and sends no event.
- Expected: the client's `GetAsync(…, ResponseHeadersRead)` completes within 5 s with 200.
- Actual: it does not complete until the fake writes the first event (verified with a 2 s probe after the fake had
  flushed headers; same under TestServer).

## Acceptance criteria
- [x] `Watch_Response_Headers_Arrive_Before_The_First_Event` unskipped and green; the other proxy tests stay green.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 qa-engineer: filed from T-0062 (PRX-8 suite). Not blocking: events themselves arrive in < 1 s.
- 2026-11-20 backend-engineer: fixed in `TransformResponseAsync`: streaming, non-upgrade → `Response.Body.FlushAsync`
  (deviation: `StartAsync` alone left headers in Kestrel's buffer — test still timed out; `StatusCode != 101` broke WS exec,
  YARP got 200 from the destination). Upgrade check extracted to `KubernetesProxyEndpoint.IsUpgradeRequest` (shared with
  the Origin check). Test unskipped; `AssertEventsStreamAsync` doc updated. BACKEND.md has no header-timing text: unchanged.

## Review
- 2026-11-20 backend-architect (triage): **CP2-blocking** (fix before the CP2 gate). `web/src/shared/k8s/watchManager.ts`
  sets `live` in `onOpen`, i.e. when `fetch` resolves, so on quiet lists (ConfigMaps, Projects — the common case) the
  spec's "Live" indicator (CP2 spec §UX, DATA-3) stays `connecting` until an event or the 300 s cap. Data is correct; status is not.
  Fix direction (small, Api only):
  - `KubernetesRequestTransformer.TransformResponseAsync`: after `base.TransformResponseAsync` + header stripping, if
    `proceed && request.IsStreaming && proxyResponse is { StatusCode: not HttpStatusCode.SwitchingProtocols }`, then
    `await httpContext.Response.StartAsync(cancellationToken)`. Skip upgrades (YARP must handle 101 itself) and the 401 path (returns false).
  - Safe w.r.t. error mapping: `KubernetesProxyEndpoint.cs:152` already guards on `Response.HasStarted`.
  - Comment the line with *why* (headers before first body byte; kube-apiserver flushes headers immediately).
  - Unskip `ProxyKestrelTests.Watch_Response_Headers_Arrive_Before_The_First_Event`; also drop the T-0090 remark in
    `ProxyStreamingAndAuditTests.AssertEventsStreamAsync` docs (headers can then be awaited before the first event).
  - Not in scope: OpenShift router idle timeout on silent watches (`haproxy.router.openshift.io/timeout`) — CP3 deploy concern either way.
- 2026-11-20 backend-architect (fix review): **APPROVE**. check-be: 325/684/706 passed, 0 skipped.
  Checked: YARP calls the transform only after upstream status and headers are known, so the flush sends the real
  upstream status. The 401→502 `CredentialRejected` path returns before the flush. Upstream 403/410 on a watch pass
  through unchanged (as before). Watches/follows are GETs, so they are not audited. `Set-Cookie`/`WWW-Authenticate`
  are stripped before the flush. Base returns false for a null `proxyResponse`, so no flush happens and the
  endpoint's 502 mapping still applies. Kestrel uses chunked framing (no Content-Length), with no response compression
  in the Api, and HTTP/2 clients get an early HEADERS frame. Choosing upgrades by the incoming request (not by 101) is
  correct given HTTP/2 extended CONNECT (T-0091).
  Optional:
  - `Proxy/KubernetesRequestTransformer.cs:101` — add `proxyResponse is not null &&` to the condition, so the guard
    doesn't rely on YARP's base returning false for null.
  - `Proxy/` tests — a watch to an unreachable cluster (502 problem) and a watch the cluster answers 401 (502
    `CredentialRejected`) would pin both edges.

## Handover notes
- Early flush applies only to `IsStreaming && !upgrade` with `proceed` true; normal GETs, errors, the 401→502 mapping
  and audit status keep their timing. After the flush, mid-stream failures can't become ProblemDetails (HasStarted guard).
- Router idle timeout on silent watches remains a CP3 deploy concern (see Review).
