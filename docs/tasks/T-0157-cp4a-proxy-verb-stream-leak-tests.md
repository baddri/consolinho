---
id: T-0157
title: CP4a proxy coverage — mutation verbs denied/audited, grant token upstream, 50 MiB log streaming, leak sweep
status: done
owner: backend-engineer
checkpoint: 4a
depends_on: [T-0156]   # asserts the final exec audit shape; the ACT-5/SAFE-2 parts may start after T-0155
paths: [tests/FleetConsole.Api.Tests/Integration/Proxy, tests/FleetConsole.Api.Tests/Fakes/FakeKubeApiServer.cs, tests/FleetConsole.Api.Tests/Integration/TokenLeakScanner.cs]
review_rounds: 0
---

## Goal
Pin the CP4a backend acceptance with Api tests: every verb CP4a uses is refused for RO before forwarding and audited.
Allowed requests carry only the grant token upstream. Log bodies stream without buffering. No token leaks through log
streams or exec handshakes. Production code should not change. If a test finds a bug, fix it here only when it is
≤ 10 lines in `src/FleetConsole.Api/Proxy`, otherwise file a bug task.

## Scope
- In: tests and fake-server helpers (a log body generator, a `MapExecEcho` helper if T-0156 didn't add one).
- Out: production features.

## Contract / design notes
Verbs/paths (namespace `shop`, pod `web-1`, deployment `web`):
| Verb | Path | Used by |
|---|---|---|
| `PATCH` (json-patch / merge) | `/apis/apps/v1/namespaces/shop/deployments/web` | labels, annotations, pause, restart, strategy, rollback |
| `PATCH` | `/apis/apps/v1/namespaces/shop/deployments/web/scale` | count modal / ring (DEP-4/5) |
| `PATCH` | `/api/v1/namespaces/shop/pods/web-1` | pod labels/annotations |
| `DELETE` | `/api/v1/namespaces/shop/pods/web-1` | DEP-1 |
| `POST` | `/apis/batch/v1/namespaces/shop/jobs` | Job create (spec ACT-5 list) |
| `POST` | `/api/v1/namespaces/shop/pods/web-1/exec?…` | kubectl-style exec |
| `GET` + WebSocket upgrade | same exec path | the browser terminal |
| `GET` | `/api/v1/namespaces/shop/pods/web-1/log?follow=true&tailLines=1000&timestamps=true` | LOG-3/7/9 |

## Context pack
- Exemplars: `ProxyAuthorizationMatrixTests.cs` L82-120 (`[Theory]` matrix: extend the rows, don't copy the class);
  `ProxyKestrelTests.cs` L56-104 (exec over sockets) and L107-133 (stream timing over sockets);
  `ProxyTokenLeakSweepTests.cs:NoToken_InAnyProxyResponse_AuditEntry_DatabaseRow_OrLogLine` L30 (add log + exec
  traffic to its scenario); `FakeKubeApiServer.cs:Map` L170, `RecordedRequest` L39 (upstream `Authorization` assert).
- Memory delta: measure `GC.GetTotalMemory(true)` before and after reading the whole 50 MiB body through the client.
  Assert the delta is < 16 MiB, and assert the first chunk arrived before the fake finished writing (use a
  `TaskCompletionSource` the fake awaits midway).

## Acceptance criteria
- [x] ACT-5 / TERM-4: each verb row × {RO grant, globally RO user} → 403 (`Proxy.ReadOnlyGrant` / `Proxy.UserReadOnly`),
      0 upstream requests, one denied `proxy.*` entry with the right action (`patch`/`delete`/`create`/`connect`) and
      subresource (`scale`, `exec`).
- [x] SAFE-2: each verb row for an RW grant → the upstream saw exactly one `Authorization: Bearer <grant token>` and
      no cookie. Allowed entries are audited (SAFE-4: action + subresource recorded; labels are FE, POL-3).
- [x] LOG-7: a 50 MiB log streams through the proxy with the memory delta bound above, and the first bytes arrive
      before the upstream finishes.
- [x] LOG-3/9: a followed log line written by the fake reaches the client in < 2 s; `sinceTime`/`timestamps`/`previous`
      are forwarded byte-for-byte; no audit entry for any log GET.
- [x] SAFE-3: the leak sweep includes a followed log and an exec handshake + frames. The token appears in no response,
      audit entry, DB row or captured log line.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 backend-engineer: started; folding in T-0156 review (upgrade callback gated on Connect, end cause).
- 2026-11-23: verb matrix (21 rows), log streaming (50 MiB + follow), Kestrel sweep added. Bug: WebSocket watch logged
  2403 "Exec session ended" → fixed (1 line, `KubernetesProxyEndpoint` gates the handshake callback on `Connect`).
  End-cause "client on clean close" not reproduced (full close handshake → `Cause=Upstream`, 5/5 runs): pinned, no change.
  `scripts/check-be.sh` green (333/711/836).

## Review
- 2026-11-23 backend-architect, round 1: **APPROVE**. `scripts/check-be.sh` green (333/711/836). All ACs covered:
  7 verb rows × 3 principals (ACT-5/TERM-4/SAFE-2/SAFE-4), the WebSocket exec upgrade stays in `ProxyKestrelTests`.
  The 50 MiB test proves streaming: the fake holds 49.9 MiB back until the client has read the first chunk, so a
  buffering proxy would time out. The heap delta is measured mid-stream and at the end. Timing waits are polled with a
  15 s ceiling, or are negative checks after a delay that can only false-pass. The Connect gate (1 line) is correct.
  The deviations are accepted: separate class from the GET/PUT matrix (different row shape), own Kestrel host for the
  exec sweep, `Cause=Upstream` pinned.
  - Optional: ProxyLogStreamTests.cs:61-79 — `GC.GetTotalMemory` is process-wide, and the unit-test classes without
    `[Collection]` run in parallel. If this ever flakes, measure in a dedicated non-parallel collection.
  - Optional: ProxyLogStreamTests.cs:68 — `midStream == 0` is the "not yet measured" sentinel. Use `long?` to make it explicit.

## Handover notes
- New: `ProxyMutationVerbTests` (TestServer; 7 CP4a verb rows × RO grant / RO user / RW: 403 + no upstream + denied
  entry, or exactly one `Bearer <grant token>`, no Cookie, raw target as sent, allowed entry with action/subresource).
- New: `ProxyLogStreamTests` (Kestrel variant): 50 MiB non-follow log, fake waits on a TCS until the client saw the first
  chunk; heap delta < 16 MiB mid-stream and at end. Followed line < 2 s; follow/tailLines/timestamps/sinceTime/previous
  query forwarded byte-for-byte; no audit entry.
- `ProxyKestrelTests`: + WebSocket watch is neither audited nor logged as an exec session (pins the fix); + clean
  cluster close is `Cause=Upstream`.
- `ProxyTokenLeakSweepTests`: followed log added to the TestServer scenario; new Kestrel fact sweeps a followed log and an
  exec handshake + frames + close (response headers, frames, close reason, audit, DB, logs).
- Production: one condition in `src/FleetConsole.Api/Proxy/KubernetesProxyEndpoint.cs` (`&& request.Verb == KubernetesVerb.Connect`).
- For T-0091: end cause still uses `clientAborted` too; not seen misclassifying on Kestrel/HTTP 1.1, recheck with HTTP/1.1 pinning.
- Exec over plain POST is covered here; the browser upgrade (RO denial, RW bearer/no cookie) stays in `ProxyKestrelTests`.
