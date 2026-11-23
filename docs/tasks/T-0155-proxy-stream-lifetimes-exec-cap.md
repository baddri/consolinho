---
id: T-0155
title: Proxy stream lifetimes — exec session cap, followed-log cap, upgrade idle timeout, pool grace
status: done
owner: backend-engineer
checkpoint: 4a
depends_on: []
paths: [src/FleetConsole.Application/Proxy/ProxyOptions.cs, src/FleetConsole.Api/Proxy/KubernetesProxyEndpoint.cs, src/FleetConsole.Api/Proxy/ProxySetup.cs, src/FleetConsole.Api/Proxy/ForwarderErrorMapper.cs, src/FleetConsole.Api/Proxy/ProxyLog.cs, src/FleetConsole.Api/appsettings.json, src/FleetConsole.Infrastructure/DependencyInjection.cs, src/FleetConsole.Infrastructure/Kubernetes/ClusterForwardingClientPool.cs, tests/FleetConsole.Api.Tests/Integration/Proxy, tests/FleetConsole.Api.Tests/Kubernetes, docs/specs/CP2-api-contract.md, docs/architecture/BACKEND.md, docs/architecture/SECURITY.md, deploy/kustomize/base]
review_rounds: 2
---

## Goal
Give every proxied stream a bounded life, so a revoked user's followed log or terminal ends at the next cap. Stop an
idle terminal being cut after 5.5 min, and stop an admin cluster edit cutting open streams 6 min later (HANDOVER CP4
gotcha). Implements ADR-0036 §1–2 (spec TERM-8, LOG-6 "expected cut", LOG-7 "quiet 60 s").

## Scope
- In: `Proxy:ExecSessionCap`, hard lifetime timer in the endpoint, upgrade `ActivityTimeout`, pool grace derived from
  options, config validation, docs, tests.
- Out: exec audit timing and the `container` detail (T-0156). CP4 verb/leak coverage tests (T-0157). FE.

## Contract / design notes
- `ProxyOptions.ExecSessionCap` (TimeSpan, default `01:00:00`; whole seconds, ≥ 1 s, validated in
  `ProxyOptionsValidator` like `WatchTimeoutCap`). Add it to `appsettings.json` `Proxy` and CP2 contract §7.
  Add a `StreamLifetime(bool isUpgrade)` helper or two properties (engineer's choice), documented:
  upgrade → `ExecSessionCap`, other streams → `StreamIdleTimeout` (watch cap + 30 s).
- Endpoint, streaming requests only (`request.IsStreaming`), just before `forwarder.SendAsync`:
  `using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);`
  `lifetime.CancelAfter(...)`. Use `TimeProvider` (inject it; `new CancellationTokenSource(delay, timeProvider)` + link)
  so tests can configure short caps. Then `context.RequestAborted = lifetime.Token`. YARP reads `RequestAborted` for its
  activity token. Comment why.
- `ForwarderRequestConfig.ActivityTimeout`: upgrade → `ExecSessionCap`; other streams → `StreamIdleTimeout`
  (unchanged); non-streaming → `RequestTimeout` (unchanged).
- When the lifetime fires, YARP reports `ResponseBodyCanceled` / `UpgradeRequestCanceled` / `UpgradeResponseCanceled`
  (client-side errors). Make sure nothing is logged at Warning or above and no problem is written. Add a Debug/Information
  `ProxyLog.StreamLifetimeReached(method, cluster, path)`. Keep the audit status as it is today for non-upgrades. For
  exec, T-0156 changes it.
- Pool: `DependencyInjection.cs` L112 registers the pool as a type. Switch to a factory, or make the pool take
  `IOptions<ProxyOptions>` and set `RetiredHandlerGracePeriod = max(StreamIdleTimeout, ExecSessionCap) + 1 min`.
  Update the default's comment (L29-30). Keep the `init` override for tests.
- Docs: SECURITY.md §Proxy hardening "Limits" bullet (followed logs capped at the stream lifetime, exec at
  `ExecSessionCap`, both re-authorize on reconnect); BACKEND.md §The proxy one line; deploy base config, only if it
  lists `Proxy__*` keys (grep first).

## FE contract
- Followed log (`GET …/k8s/api/v1/namespaces/{ns}/pods/{pod}/log?follow=true…`): headers flushed at once. It may be
  silent for up to 330 s and lives at most `WatchTimeoutCap + 30 s` (5.5 min default). At the cap the body is **aborted**
  (the fetch reader rejects), not cleanly ended. The SPA must treat EOF and abort the same way: if the container is
  still running, reconnect with `sinceTime` (LOG-6).
- Exec WebSocket: lives at most `ExecSessionCap` (60 min default) and is never cut for being idle before that. At the cap
  the socket closes **without a close frame** (`CloseEvent.code` 1006), which leads to TERM-3 "The terminal connection
  has closed." + Reconnect. An admin cluster edit no longer cuts open sessions or logs.

## Context pack
- Docs: ADR-0036 §1–2; ADR-0020 §5/§7; SECURITY.md L78-95; BACKEND.md L184-214.
- Touch points: `KubernetesProxyEndpoint.cs:L95-167` (`ProxyRequest.Create`, `ForwarderRequestConfig` L130-134,
  `SendAsync`, error mapping); `ProxyOptions.cs` (whole file, 37 lines); `ProxySetup.cs:ProxyOptionsValidator` L38-67;
  `ForwarderErrorMapper.cs:IsClientSide`; `ClusterForwardingClientPool.cs` L25-45, L147; `ProxyLog.cs`.
- Test exemplars: `ProxyRevocationTests.cs:Open_Watch_Ends_Within_The_Cap_And_The_ReWatch_After_Revocation_Is_404`
  (L85; short-cap config + revoke + re-request), `ProxyKestrelTests.cs:WebSocket_Exec_Is_Forwarded_With_The_SA_Token_And_Audited_As_Connect`
  (L56-104; real sockets exec against `FakeKubeApiServer`), `FakeKubeApiServer.cs:Map/MapGet` (L170-230; handlers can
  hold a log body open).

## Acceptance criteria
- [x] TERM-8: with `ExecSessionCap` = 2 s, an open exec socket is closed by the proxy within cap + 1 s. After the grant is
      revoked, the reconnect gets 404 (Kestrel test).
- [x] An exec socket idle for longer than `StreamIdleTimeout` (configure watch cap 1 s, exec cap 10 s) stays open.
- [x] Followed log: with watch cap 1 s, a `follow=true` stream is cut within lifetime + 1 s. After revocation the
      re-request is 404. No Warning/Error log for the cut.
- [x] LOG-7 (part): a followed log quiet for longer than `RequestTimeout` (configure 1 s, quiet 3 s) is not cut, and the
      next line still arrives.
- [x] Pool: a unit test asserts the grace period comes from options (`max(...) + 1 min`). A stream opened before a
      cluster edit is not disposed at the old 6 min (fake `TimeProvider` in the pool test, existing pattern).
- [x] `ProxyOptionsValidator` rejects `ExecSessionCap` ≤ 0 or fractional seconds (unit test). Docs/contract §7 updated.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 backend-engineer: in_progress → in_review. `ExecSessionCap` + `StreamLifetime(isUpgrade)`, endpoint lifetime
  timer (TimeProvider, linked into `RequestAborted`), upgrade ActivityTimeout = exec cap, `ProxyLog` 2402 (Debug), pool grace
  from options via DI factory. Deploy base lists no `Proxy__*` keys, so untouched. check-be green (802/705/333).
- 2026-11-23 backend-engineer: review round 1 fixed. `Proxy:StreamIdleSlack` (default 30 s, ≥ 0; validator cases, CP2 §7,
  appsettings, SECURITY Limits); `StreamIdleTimeout = WatchTimeoutCap + StreamIdleSlack`. Lifetime tests: watch cap 1 s,
  slack 4 s, exec cap 10 s; exec idles 6 s (> 5 s). Checked: upgrade ActivityTimeout → `StreamIdleTimeout` fails the exec
  test. LIFO comment added at the lifetime flag. Tests take ~10 s (exec) + ~6 s (log).

## Review
### Round 1 — backend-architect, 2026-11-23: CHANGES_REQUESTED
check-be green (802/705/333). Race fix, grace-from-options, validator, docs and log level are correct and match ADR-0036.
Required:
1. src/FleetConsole.Application/Proxy/ProxyOptions.cs:31 + ProxyStreamLifetimeTests.cs:21-24,50 — the 30 s slack is fixed, so the
   idle-exec test idles only past `RequestTimeout`; nothing end-to-end checks that upgrades idle on `ExecSessionCap`
   rather than `StreamIdleTimeout` (the bug this task fixes: reverting L137 to `StreamIdleTimeout` stays green). It also
   makes the followed-log test 31 s in the serial Api collection — add `ProxyOptions.StreamIdleSlack` (default `00:00:30`,
   ≥ 0, validator + unit case, CP2 §7 row, `StreamIdleTimeout = WatchTimeoutCap + StreamIdleSlack`); variant: watch cap
   1 s, slack 4 s (lifetime 5 s > the 3 s quiet), exec cap 10 s; the exec test idles > 5 s, as the AC says. Drop the
   deviation note in the class remarks and work log.
Optional:
- KubernetesProxyEndpoint.cs:150 — the flag is set before YARP's abort only because CTS runs callbacks LIFO (this
  registration is after the linked source's); say so in the comment.

### Round 2 — backend-architect, 2026-11-23: APPROVE
check-be green (805/705/333); Api suite 2 m 14 s → 1 m 34 s. Finding 1 fixed: `StreamIdleSlack` (≥ 0, validated, CP2 §7,
appsettings); the test setup now uses watch cap 1 s, slack 4 s, exec cap 10 s, and the exec test idles past `StreamIdleTimeout`. Optional comment added.
ADR-0036 keeps "watch cap + 30 s" (the default); acceptable, as CP2 §7 documents the knob.

## Handover notes
- `ProxyOptions.StreamLifetime(isUpgrade)`: upgrade → `ExecSessionCap` (default 1 h), else `StreamIdleTimeout`. It is both
  the hard lifetime and YARP's `ActivityTimeout` for streams. Non-streaming requests are unchanged.
- Endpoint: `new CancellationTokenSource(lifetime, TimeProvider)` linked with the client token and assigned to
  `RequestAborted` around `SendAsync`, then restored. "Lifetime reached" is decided **in the timer callback**, because
  YARP's `context.Abort()` also cancels the connection token, so checking afterwards races. Then no mapping, no problem
  body and no Warning, only `ProxyLog.StreamLifetimeReached` (2402, Debug). Audit status is unchanged (101/200 for exec).
  T-0156 owns exec audit timing; a free EventId for `ExecSessionEnded` is 2403.
- Pool: `ClusterForwardingClientPool.GracePeriodFor(options)` = max(lifetimes) + 1 min, set by a DI factory. The default
  constant is now 61 min (= the default options).
- `Proxy:StreamIdleSlack` (default 30 s) is the slack in `StreamIdleTimeout`; the pool grace follows it.
- Tests: `Integration/Proxy/ProxyStreamLifetimeTests.cs` (Kestrel variant; admin logs in over sockets because a Kestrel
  variant has no in-memory client), plus pool and options cases in `Kubernetes/ClusterForwardingClientPoolTests.cs` and
  `Proxy/ProxyEndpointPartsTests.cs`.
