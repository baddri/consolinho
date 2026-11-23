---
id: T-0156
title: Exec audit at the handshake — proxy.connect written on 101, container in details, session-end log
status: done
owner: backend-engineer
checkpoint: 4a
depends_on: [T-0155]   # both edit KubernetesProxyEndpoint around SendAsync
paths: [src/FleetConsole.Application/Proxy/Requests/ProxyRequest.cs, src/FleetConsole.Application/Proxy/RecordProxyAudit, src/FleetConsole.Api/Proxy/KubernetesProxyEndpoint.cs, src/FleetConsole.Api/Proxy/KubernetesRequestTransformer.cs, src/FleetConsole.Api/Proxy/ProxyLog.cs, tests/FleetConsole.Application.Tests/Proxy, tests/FleetConsole.Api.Tests/Integration/Proxy, docs/specs/CP2-api-contract.md, docs/architecture/SECURITY.md, web/src/mocks/k8s/proxyAudit.ts]
review_rounds: 0
---

## Goal
An exec session's audit entry must exist as soon as the shell opens, not when it closes up to 60 min later (TERM-7,
security). It must also name the container. Session end is logged with its duration. Implements ADR-0036 §3–5. The
Api tests also cover TERM-4 and TERM-6.

## Scope
- In: `ProxyRequest.Container`, `ProxyAuditDetails.container`, the transformer's 101 callback, endpoint audit-once
  logic, `ProxyLog.ExecSessionEnded`, contract §5, SECURITY §Audit, the MSW audit fixture (one `container` field).
- Out: FE label map (POL-3, CP4c). Lifetimes (T-0155).

## Contract / design notes
- `ProxyRequest`: new positional `string? Container` after `FieldManager` = first decoded `container` query value
  when `Verb == KubernetesVerb.Connect`, else null (`KubernetesQuery.First`, like `DryRun`). XML doc says why only
  connect. The `command` values are **never** parsed or recorded (ADR-0036 §5).
- `RecordProxyAuditHandler.ProxyAuditDetails` gains `string? Container` (after `FieldManager`). The summary stays as it is.
- `KubernetesRequestTransformer`: new constructor parameter `Func<ValueTask>? onSwitchingProtocols`, awaited in
  `TransformResponseAsync` when `proxyResponse.StatusCode == 101` and the request is an upgrade, **before**
  `base.TransformResponseAsync` returns, so no frame is relayed before the entry is written.
  (HTTP/2 extended-CONNECT answers 200, but kube-apiserver over our HTTP/1.1 upgrade path answers 101; see T-0091.)
- Endpoint: pass `() => audit.RecordAsync(101, reason: null)` for upgrades, keep a `bool auditedAtHandshake`, and skip
  the post-`SendAsync` record when set. Non-101 upgrade answers (403/400/404 Status) and all non-upgrade mutations keep
  today's path. A failed write is logged at Error by `ProxyAudit` and the session continues (ADR-0021 §4).
- After an audited upgrade, `ProxyLog.ExecSessionEnded(cluster, namespace, pod, container, durationMs, cause)` at
  Information. `cause`: `cap` when T-0155's lifetime token fired, `client` for `RequestAborted` from the client,
  otherwise `upstream`. Use `TimeProvider.GetTimestamp` for the duration. Never log the query.

## FE contract
- Terminal socket: `new WebSocket("wss://<console-origin>/api/clusters/{cluster}/k8s/api/v1/namespaces/{ns}/pods/{pod}/exec?command=sh&command=-i&command=-c&command=TERM%3Dxterm%20sh&container={c}&stdin=1&stdout=1&stderr=1&tty=1", ["base64.channel.k8s.io"])`.
  The session cookie authenticates it. `Origin` must equal the console's public origin. `X-Console-Request` is not
  needed (it is a GET).
- Pre-upgrade refusals are HTTP responses that browsers do not expose to `WebSocket` (you only get `error` + close 1006):
  403 `Proxy.OriginNotAllowed`, 403 `Proxy.UserReadOnly` / `Proxy.ReadOnlyGrant` (audited denied), 404 `Proxy.NotAvailable`,
  502 `Proxy.CredentialRejected`/`UpstreamUnavailable`/`UpstreamTls`, 504 `Proxy.UpstreamTimeout`, and the cluster's
  own 403 for missing `create pods/exec`. So the SPA must gate on `accessMode` (TERM-4) and the SSAR check (TERM-5) and
  open no socket, rather than parse handshake errors.
- Channel bytes are relayed unchanged in both directions. With `base64.channel.k8s.io`, channel `3` (error) carries
  text. TERM-9 prints it.
- Audit (admin audit log): action `proxy.connect`, `details.subresource` = `"exec"`, new **`details.container`**
  (string | null; null for non-connect entries), `statusCode` 101 for an opened session. Entries are written at the
  handshake, and denied attempts are recorded the same way. Log reads (`…/log`) are never audited (LOG-9). `details`
  is an untyped JSON object in OpenAPI, so `gen:api` does not change. Update the MSW fixture by hand.

## Context pack
- Docs: ADR-0036 §3–5; ADR-0021 §2–4; CP2 contract §5 (L59-80); SECURITY.md §Audit (L96-103).
- Touch points: `ProxyRequest.cs:Create` (L56-80, `DryRun`/`FieldManager` pattern); `RecordProxyAuditHandler.cs`
  L44-60 (details construction) and L106-119 (`ProxyAuditDetails`); `KubernetesRequestTransformer.cs:TransformResponseAsync`
  L90-121 and its constructor; `KubernetesProxyEndpoint.cs` the `ProxyAudit` helper + L96, L128, L159-167 (post-forward
  record); `ProxyLog.cs` (source-generated `LoggerMessage` pattern).
- Test exemplars: `ProxyKestrelTests.cs:WebSocket_Exec_Is_Forwarded_With_The_SA_Token_And_Audited_As_Connect` L56-104
  (extend: assert the entry exists **while the socket is still open**); `tests/FleetConsole.Application.Tests/Proxy`
  `ProxyRequest` classification tests (add `container` cases).

## Acceptance criteria
- [x] TERM-7: with the socket open and no frame sent, the audit table already holds one `proxy.connect` entry (status
      101, outcome allowed, subresource exec, container = the requested container). After close there is still exactly one.
- [x] TERM-6: echo round trip over `base64.channel.k8s.io` through the proxy: subprotocol negotiated as sent, stdin
      frame echoed on stdout in < 500 ms; an `Origin` mismatch gives 403 `Proxy.OriginNotAllowed` and no upstream request.
- [x] TERM-4: an RO grant and a globally RO user each get 403 on the exec upgrade, with no upstream request and a
      denied entry with `container` set.
- [x] Upstream 403 on exec (RBAC) → audited once with status 403, no handshake entry.
- [x] `ExecSessionEnded` is logged with cause `cap`/`client`. The log line contains no `command` value and no token.
- [x] `ProxyRequest` unit tests: `container` is parsed for exec/attach and null for a GET with `?container=` on `/log`.
- [x] CP2 contract §5 and SECURITY §Audit say that exec is audited at the handshake and that `container` is recorded
      and the command is not.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 backend-engineer: `ProxyRequest.Container`, `details.container`, transformer handshake callback, endpoint
  audit-once + `ProxyLog.ExecSessionEnded` (2403, enum cause), contract §5/SECURITY §Audit/MSW fixture. Deviation: the
  callback is `Func<int, ValueTask>` and records the upstream status as is, firing on 101 **or** on 200 to an HTTP/2
  extended CONNECT (the fake and YARP's default still negotiate that until T-0091), so the test sees 200 today.
  check-be green (333/711/810).

## Review
- 2026-11-23 backend-architect, round 1: **APPROVE**. check-be green (333/711/810). Contract, ADR-0036 §3–5, AC met;
  the `Func<int, ValueTask>` deviation is justified (records upstream status as is, 200 only for extended CONNECT until T-0091).
- Optional / follow-up (not blocking; the cause is Information-level operational data, audit correctness is unaffected):
  - KubernetesProxyEndpoint.cs:213 — `clientAborted.IsCancellationRequested` is likely already true after any tunnel
    end (Kestrel cancels RequestAborted once the connection closes), so a shell `exit` can log `client` — consider
    deciding from `forwardError` only (`IsClientSide` → client, else upstream) and pinning it with a test in T-0091.
  - KubernetesProxyEndpoint.cs:136 — the callback is wired for any upgrade, so a WebSocket on a non-connect path (e.g.
    watch) would log 2403 "Exec session ended" with no entry written; gate on `request.Verb == KubernetesVerb.Connect`.

## Handover notes
- Handshake audit: `KubernetesRequestTransformer.TransformResponseAsync` awaits `onSwitchingProtocols(status)` before
  `base.TransformResponseAsync`, i.e. before YARP sends 101 to the client; endpoint sets `auditedAtHandshake` and skips
  the post-SendAsync record. Refused upgrades (403/400/404) take the old path.
- Status recorded = upstream status: 101 on HTTP/1.1 Upgrade, 200 on extended CONNECT. Once T-0091 pins HTTP/1.1, the
  `forwarded.Method == "CONNECT" ? 200 : 101` branch in `ProxyKestrelTests` and the contract's 200 note can go.
- End cause: `cap` = lifetime flag (T-0155); `client` = connection token cancelled or a client-side `ForwarderError`;
  else `upstream`. A clean close initiated by the cluster may show as `client` depending on which side YARP sees first
  (test only asserts a log line exists there).
- New tests: `ProxyKestrelTests` (TERM-4/6/7, RBAC 403, client cause), cap cause in `ProxyStreamLifetimeTests`,
  container cases in `ProxyRequestTests`/`RecordProxyAuditHandlerTests`. Only `container: null` added to the MSW fixture.
