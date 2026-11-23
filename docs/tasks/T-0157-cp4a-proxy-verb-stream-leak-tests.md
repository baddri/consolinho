---
id: T-0157
title: CP4a proxy coverage — mutation verbs denied/audited, grant token upstream, 50 MiB log streaming, leak sweep
status: todo
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
- [ ] ACT-5 / TERM-4: each verb row × {RO grant, globally RO user} → 403 (`Proxy.ReadOnlyGrant` / `Proxy.UserReadOnly`),
      0 upstream requests, one denied `proxy.*` entry with the right action (`patch`/`delete`/`create`/`connect`) and
      subresource (`scale`, `exec`).
- [ ] SAFE-2: each verb row for an RW grant → the upstream saw exactly one `Authorization: Bearer <grant token>` and
      no cookie. Allowed entries are audited (SAFE-4: action + subresource recorded; labels are FE, POL-3).
- [ ] LOG-7: a 50 MiB log streams through the proxy with the memory delta bound above, and the first bytes arrive
      before the upstream finishes.
- [ ] LOG-3/9: a followed log line written by the fake reaches the client in < 2 s; `sinceTime`/`timestamps`/`previous`
      are forwarded byte-for-byte; no audit entry for any log GET.
- [ ] SAFE-3: the leak sweep includes a followed log and an exec handshake + frames. The token appears in no response,
      audit entry, DB row or captured log line.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
