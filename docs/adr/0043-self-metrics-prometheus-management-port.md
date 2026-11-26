# 0043 — FleetConsole's own metrics: Prometheus scrape on a management port, bounded labels
**Status:** Accepted (2026-11-26, backend-architect; CP6a, spec Q3/Q8 provisionally accepted) · extends ADR-0028 §2
(probes unchanged), ADR-0030 (manifests gain a port and an optional component)

## Context
OBS-1..6: on OpenShift the natural consumer is user-workload monitoring (Prometheus, ServiceMonitor). OTel metrics
already exist (meters of ASP.NET Core, HttpClient, runtime, `ApplicationDiagnostics.MeterName`) but are only pushed via
OTLP in dev. The scrape endpoint must not be reachable through the Route and must not leak users or resource names.

## Decision
1. **Exporter:** `OpenTelemetry.Exporter.Prometheus.AspNetCore` (pre-release, pinned in `Directory.Packages.props` to the
   build matching OpenTelemetry 1.17), added in `ServiceDefaults` next to OTLP; OTLP stays when
   `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
2. **Management port:** `Management:Port` (int, unset = no scrape endpoint; manifests set `8081`). Kestrel listens on it
   in addition to the HTTP port; `/metrics` is mapped with `RequireHost("*:{port}")` and a short-circuit middleware
   answers 404 for every other path on that port (no SPA, API or health there). No authentication: reachability is
   limited by a NetworkPolicy to the `openshift-user-workload-monitoring` namespace; Service port `metrics`; the Route
   keeps `targetPort: http`.
3. **Instruments** live on one meter per layer: `ApplicationDiagnostics.MeterName` (Application; Infrastructure records
   through it) and a new `ApiDiagnostics.MeterName` (`FleetConsole.Api`). Names (`fleetconsole.*`) and label sets are
   the contract in tasks T-0405/T-0407 and `BACKEND.md` § Observability. **Allowed labels:** `cluster` (cluster *name*, ≤ ~40), `verb`,
   `status_class` (`2xx`…`5xx`), `reason`/`result`/`kind` enums, `policy`, `check`. **Forbidden:** user, group, namespace,
   resource name, path, URL, IP.
4. **Health as metrics:** a `IHealthCheckPublisher` records `fleetconsole.health.status{check}` (0 Unhealthy,
   1 Degraded, 2 Healthy) every 30 s, so alerts read readiness components (keyring, Postgres, Redis) without a probe.
5. **Alerts/dashboard:** optional kustomize component `deploy/kustomize/components/monitoring` (ServiceMonitor +
   PrometheusRule); Grafana JSON + documented PromQL in `deploy/observability/`. No objects in `openshift-*` namespaces.

## Consequences
- One more listening port and NetworkPolicy rule; dev (`aspire run`) unchanged unless `Management:Port` is set.
- New instruments must follow the label rule; reviewers reject unbounded labels.

## Alternatives rejected
- `/metrics` on the main port: reachable via the Route unless filtered; mixing it with the SPA fallback is error-prone.
- `prometheus-net`: second metrics stack next to OTel meters we already emit.
- `Prometheus.HttpListener` exporter: separate listener outside Kestrel, less maintained, no shared middleware.
