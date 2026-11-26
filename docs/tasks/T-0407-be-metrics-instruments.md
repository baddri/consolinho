---
id: T-0407
title: FleetConsole metrics — login, proxy, streams, rate limit, access cache, health publisher
status: todo
owner: backend-engineer
checkpoint: 6a
depends_on: [T-0406, T-0405]
paths: [src/FleetConsole.Api/Diagnostics, src/FleetConsole.Api/Proxy, src/FleetConsole.Api/Auth, src/FleetConsole.Api/Http/RateLimiting, src/FleetConsole.Application/ApplicationDiagnostics.cs, src/FleetConsole.Infrastructure/Caching/FusionQueryCache.cs, src/FleetConsole.Api/Hosting, tests/FleetConsole.Api.Tests, docs/architecture/BACKEND.md]
review_rounds: 0
size: M (1 d)
---

## Goal
The instruments alerts and dashboards need (spec OBS-2, OBS-6), all with bounded labels (ADR-0043 §3–4).

## Scope
- In: instruments below, span tag, health publisher, label-guard test, BACKEND.md § Observability table.
- Out: alert rules/dashboards (T-0412).

## Contract / design notes
All counters `long`; names are the contract (dashboards in T-0412 query them as `fleetconsole_*_total` etc.).

| Instrument | Type, unit | Labels | Recorded in |
|---|---|---|---|
| `fleetconsole.auth.logins` | Counter `{login}` | `result`=`success\|failure`, `reason` (failure code enum, e.g. `state_mismatch`, `denied`, `not_provisioned`, `deactivated`, `upstream_error`; `none` on success) | Api auth callback handler, where `auth.login_*` audits are dispatched |
| `fleetconsole.proxy.requests` | Counter `{request}` | `cluster`, `verb` (Kubernetes verb from `ProxyRequest`), `status_class`, `kind`=`plain\|watch\|log\|exec` | `KubernetesProxyEndpoint` `finally` |
| `fleetconsole.proxy.request.duration` | Histogram `s` | `cluster`, `verb`, `status_class` | same, **non-streaming only** |
| `fleetconsole.proxy.upstream_errors` | Counter `{error}` | `cluster`, `reason` = mapped `ForwarderError` / TLS / timeout / 401 enum | where forward errors map to 502/504 |
| `fleetconsole.proxy.active_streams` | UpDownCounter `{stream}` | `cluster`, `kind`=`watch\|log\|exec` | +1 on start, −1 in `finally` |
| `fleetconsole.rate_limit.rejections` | Counter `{rejection}` | `policy`=`login\|proxy-mutations\|fleet-status` | `OnRejected`/middleware (T-0402/T-0403 hooks) |
| `fleetconsole.access_cache.lookups` | Counter `{lookup}` | `result`=`hit\|miss` | `FusionQueryCache` via `ApplicationDiagnostics` (factory callback = miss) |
| `fleetconsole.health.status` | Gauge (ObservableGauge or `Gauge<int>`) | `check` (registered check name) | `HealthMetricsPublisher : IHealthCheckPublisher`, Period 30 s |

- Span tag: `fleetconsole.cluster` (name) on the ASP.NET request activity in the proxy endpoint (`Activity.Current?.SetTag`).
- Instruments are created once in `ApiDiagnostics` (Api) / `ApplicationDiagnostics` (Application) via `IMeterFactory`;
  call sites get the class from DI. Cluster label = `ProxyTarget.ClusterName`; pre-authorize failures use `cluster="unknown"`
  (never the raw route segment — unbounded).
- Guard test: collect all `fleetconsole.*` measurements during a login + proxy + watch run and assert tag keys ⊆ the
  allowed set of ADR-0043 §3 and no value contains the test user, namespace or resource name.
- BACKEND.md § Observability: the table above (source of truth after merge).

## Context pack
- `src/FleetConsole.Application/ApplicationDiagnostics.cs` (meter pattern); `src/FleetConsole.Api/Diagnostics/ApiDiagnostics.cs` (from T-0405).
- `src/FleetConsole.Api/Proxy/KubernetesProxyEndpoint.cs:HandleAsync` (forward/finally ~L147-190; stream kinds from `ProxyRequest`).
- Health: `Api/Hosting` health registration (`KeyRingHealthCheck` registration site; `grep -n AddHealthChecks src/FleetConsole.Api`).
- Tests: `MeterListener` or `MetricCollector<T>`; flows via `ApiFactory.RunLoginAsync/LoginAsAsync`, `FakeKubeApiServer`.

## Acceptance criteria
- [ ] OBS-2: each instrument emitted with the listed labels (one test per family).
- [ ] OBS-6: label-guard test passes; no user/namespace/resource/path/IP in any tag.
- [ ] `fleetconsole.health.status` reflects a forced Unhealthy check within one period (test with short period).
- [ ] Watch/log/exec still stream unbuffered (existing tests green); build + tests green; BACKEND.md updated.

## Work log

## Review

## Handover notes
