---
id: T-0412
title: Monitoring kustomize component (ServiceMonitor, PrometheusRule), Grafana dashboard, RUNBOOK alert anchors
status: todo
owner: backend-engineer
checkpoint: 6a
depends_on: [T-0407, T-0408]
paths: [deploy/kustomize/components/monitoring, deploy/kustomize/overlays, deploy/observability, scripts/deploy-dev.sh, docs/ops/RUNBOOK.md]
review_rounds: 0
size: M (1 d)
---

## Goal
Operators get alerts and a dashboard from the metrics of T-0406/T-0407 (spec OBS-3, OBS-4, DOC-3).

## Contract / design notes
ADR-0043 §5. Nothing is created in `openshift-*` namespaces.
- `deploy/kustomize/components/monitoring/` (kind `Component`): `ServiceMonitor` (port `metrics`, interval 30 s,
  selector = app labels of base Service) and `PrometheusRule` group `fleetconsole`:
  | Alert | Expr (sketch) | for | severity |
  |---|---|---|---|
  | `FleetConsoleLoginFailuresHigh` | failure / all `fleetconsole_auth_logins_total` rate 10m > 0.5 and all > 0.1/s | 10m | warning |
  | `FleetConsoleProxyUpstream5xxHigh` | per `cluster`: 5xx / all `fleetconsole_proxy_requests_total` rate 10m > 0.2 | 10m | warning |
  | `FleetConsoleNotReady` | `kube_deployment_status_replicas_available < spec` or `up{job=…}==0` | 5m | critical |
  | `FleetConsoleKeyRingUnhealthy` | `fleetconsole_health_status{check="keyring"} == 0` | 5m | critical |
  Each alert has `runbook_url` → RUNBOOK anchor. Confirm exact exported names with a local `/metrics` scrape (units/`_total` suffixes) before writing exprs.
- Overlays: the dev overlay (consolinho) includes the component; prod overlay documents opt-in. `deploy-dev.sh` warns (not fails) when the ServiceMonitor CRD is absent.
- `deploy/observability/fleetconsole-dashboard.json` (Grafana, datasource variable) + `README.md` listing each panel's PromQL (logins, proxy rate/latency p95 by cluster, upstream errors, active streams, rate-limit rejections, access-cache hit ratio, discovery-cache hit ratio, health).
- RUNBOOK: new § "Alerts" with one anchor per alert: meaning, first checks, fix.
- `promtool check rules` in a test or script if available (podman image `prom/prometheus`); otherwise document manual check.

## Context pack
- `deploy/kustomize/base/*` (labels, Service from T-0406), `deploy/kustomize/overlays/`, `scripts/deploy-dev.sh`.
- Instrument table: `docs/architecture/BACKEND.md` § Observability (T-0407).

## Acceptance criteria
- [ ] OBS-3: `kustomize build` with the component yields ServiceMonitor + PrometheusRule; rules pass `promtool check rules`.
- [ ] OBS-4: dashboard JSON imports (valid JSON, datasource variable), PromQL documented.
- [ ] DOC-3: every alert's `runbook_url` resolves to an existing RUNBOOK anchor.
- [ ] Deployed to consolinho by the orchestrator: targets `up` in user-workload monitoring (QG6A-2; may need cluster-admin to enable UWM — human).

## Work log

## Review

## Handover notes
