---
id: T-0406
title: Prometheus scrape endpoint on a management port + manifests (Service port, NetworkPolicy)
status: todo
owner: backend-engineer
checkpoint: 6a
depends_on: []
paths: [Directory.Packages.props, src/FleetConsole.ServiceDefaults, src/FleetConsole.Api/Hosting, src/FleetConsole.Api/Program.cs, deploy/kustomize/base, tests/FleetConsole.Api.Tests/Integration/Hosting, docs/architecture/BACKEND.md, docs/ops/RUNBOOK.md]
review_rounds: 0
size: M (1 d)
---

## Goal
Expose FleetConsole's own OTel metrics to OpenShift user-workload monitoring without making them reachable via the Route (spec OBS-1).

## Scope
- In: exporter package, `Management:Port` listener, `/metrics` + 404 short-circuit on that port, manifests, tests, docs.
- Out: new instruments (T-0405/T-0407), ServiceMonitor/alerts (T-0412).

## Contract / design notes
ADR-0043 §1–2.
- `Directory.Packages.props`: `OpenTelemetry.Exporter.Prometheus.AspNetCore` pinned to the pre-release matching OTel 1.17 (comment why pre-release).
- ServiceDefaults `Extensions.ConfigureOpenTelemetry` (L62-89): `metrics.AddPrometheusExporter()` always (cheap, no
  listener); `MapDefaultEndpoints` unchanged.
- Api `Hosting/ManagementPortSetup.cs` (public static, XML docs): `ManagementOptions { int? Port }` (1–65535, ≠ HTTP port,
  validated on start, message names `Management:Port`); when set: `ConfigureKestrel` adds `ListenAnyIP(port)` while keeping
  the configured HTTP endpoint (`ASPNETCORE_HTTP_PORTS`/`urls` — verify both survive, test it); `MapPrometheusScrapingEndpoint("/metrics").RequireHost($"*:{port}")`;
  an early middleware (first after forwarded headers) that, when `LocalPort == port` and path ≠ `/metrics`, returns 404
  with no body; and `/metrics` on the main port returns 404 (SPA fallback must not serve it — check `MapFallbackToFile`
  exclusion list). Unset → nothing mapped.
- Manifests (`deploy/kustomize/base`): deployment container port `metrics` 8081; ConfigMap `Management__Port=8081`;
  Service port `metrics` 8081; NetworkPolicy: new ingress rule from namespaceSelector
  `kubernetes.io/metadata.name: openshift-user-workload-monitoring` on port 8081 only; router rule stays 8080 only. Route unchanged.
- Docs: BACKEND.md § Observability (new short subsection: management port, label rule from ADR-0043 §3); RUNBOOK §5 config row.

## Context pack
- `src/FleetConsole.ServiceDefaults/Extensions.cs:ConfigureOpenTelemetry` L62-89; `src/FleetConsole.Api/Program.cs` (pipeline order, meters L58-60).
- Tests: `tests/FleetConsole.Api.Tests/Integration/Hosting/ProductionHost.cs` + `ProductionProbeTests.cs` (real Kestrel host pattern);
  `ProxyKestrelTests` for a Kestrel-bound factory.
- Manifests: `deploy/kustomize/base/deployment.yaml`, `service.yaml`, `networkpolicy-ingress.yaml`, `kustomization.yaml` (ConfigMap literals).

## Acceptance criteria
- [ ] OBS-1: with `Management:Port` set, `GET :port/metrics` returns Prometheus text incl. `http_server_request_duration` and a `fleetconsole_*` series; `GET :port/api/me`, `:port/healthz/ready`, `:port/` → 404; `GET :http/metrics` → 404 (tests on a real Kestrel host).
- [ ] Unset → no listener, `/metrics` 404; invalid port fails start naming the key.
- [ ] `kustomize build deploy/kustomize/overlays/*` succeeds; NetworkPolicy admits only user-workload monitoring on 8081.
- [ ] Build + tests green; docs updated.

## Work log

## Review

## Handover notes
