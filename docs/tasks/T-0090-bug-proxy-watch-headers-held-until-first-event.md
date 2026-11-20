---
id: T-0090
title: "label: bug — proxy holds watch response headers until the first event"
status: todo
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
- [ ] `Watch_Response_Headers_Arrive_Before_The_First_Event` unskipped and green; the other proxy tests stay green.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 qa-engineer: filed from T-0062 (PRX-8 suite). Not blocking: events themselves arrive in < 1 s.

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

## Handover notes
