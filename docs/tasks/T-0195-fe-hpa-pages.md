---
id: T-0195
title: HorizontalPodAutoscalers — list, details with metrics table
status: done
owner: frontend-engineer
checkpoint: 4b
depends_on: [T-0189]
paths: [web/src/features/resources/registry/kinds/horizontalpodautoscalers.tsx, web/src/features/resources/workloads/hpa]
review_rounds: 0
---

## Goal
HPA-1 (first sentence): HPA list and details as OCP `hpa.tsx`. The workload side (ring, hidden count) is T-0190.

## Contract / design notes
- List columns (OCP L318-343): Name, Namespace, Labels, Scale target (link to the target via `findModel` on
  `scaleTargetRef.apiVersion/kind`), Min pods, Max pods, Created.
- Details: `DetailsSection` "HorizontalPodAutoscaler details" (OCP L186): Scale target (link), Min replicas, Max
  replicas, Last scale time (`Timestamp`), Current replicas, Desired replicas; then `MetricsTable` (OCP L72): columns
  Type, Current, Target, one row per `spec.metrics[]` matched to `status.currentMetrics[]` by type + name (Resource:
  "resource <name> on pods" with utilization % or average value; Pods / Object / External: metric name), "not
  available" when absent; then the existing `ConditionsTable`. Tabs: Details, YAML, Events (no `podsSelector`).
- Actions: common only (OCP HPA provider in the Deployment/DC menu — "Edit/Remove HorizontalPodAutoscaler" — is a
  topology/dev-console feature; out of CP4b, note for PO).
- Helpers in `workloads/hpa/metrics.ts` with unit tests (the matching logic is the only non-trivial code).

## Context pack
- Exemplars: `components/ConditionsTable.tsx`, `components/ObjectReferenceLink.tsx`, `registry/kinds/deployments.tsx`
  (DetailsSection), `shared/ui/Timestamp.tsx`.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/hpa.tsx` (`MetricsTable` L72, details
  L186, list L318-343).

## Acceptance criteria
- [x] HPA-1: list shows Name, Namespace, Labels, Scale target link, Min/Max pods for `worker` (test).
- [x] HPA-1: details show the OCP fields and a metrics row "resource cpu on pods" 35 % / 80 % (test); tabs Details, YAML, Events. — copy per OCP main: "Resource cpu (as a percentage of request)", "35% (35m)" / "80%".
- [x] `metrics.ts` unit tests cover Resource utilization, Resource average value, Pods metric, missing current.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: descriptor columns/details, `workloads/hpa/{metrics.ts,MetricsTable.tsx}` + unit and page
  tests. Followed OCP `hpa.tsx` main over the contract where they differ (see Handover). ui-probe not run: it is
  hard-wired to :5199 (orchestrator forbade it) and the OCP ref on :9000 was down.

## Review
- 2026-11-23 frontend-architect, round 1: **APPROVE**. Targeted `check-fe.sh` (hpa + registry): lint, typecheck, 52 tests green.
- Deviations accepted: no Created column, "Resource cpu (as a percentage of request)" / "35% (35m)", "-" for missing all
  match OCP `hpa.tsx` main (L39-131, L318-343); type+name matching and Object rows linking `describedObject` fix real
  OCP bugs, documented in `metricRows` TSDoc. `kinds.test.tsx` `findRow` change is minimal and justified.
- Nit (optional): `MetricsTable.tsx` MetricType — OCP separates label and hint with `&nbsp;` (no wrap break); ours uses a plain space.
- Nit (optional): unrecognized-type rows render "-"/"-" in Current/Target where OCP renders one cell; fine as is.
- 2026-11-23 ux-designer: **APPROVE** (mock :5248, 1280 light; OCP ref :9000 down, compared with `public/components/hpa.tsx` source).
- List — Name, (Namespace in all-ns), Labels, Scale target (D badge link), Min pods, Max pods, kebab — matches OCP L238-343 (no Created column, correct).
- Details — two-column grid, "HorizontalPodAutoscaler details" 18px/600, right DL Scale target/Min/Max/Last scale time/Current/Desired — matches OCP L190-216; "-" for absent = OCP DetailsItem DASH.
- Metrics — heading + default (non-compact) `pf-v6-c-table` `gridBreakPoint=""`, Type/Current/Target 50/25/25 (447/224/224 px) — matches OCP L131-139; "Resource cpu (as a percentage of request)" hint 12px subtle, "35% (35m)" / "80%" = OCP `resourceRowFn`.
- Conditions — section heading + shared ConditionsTable as OCP L219-222. Tabs Details/YAML/Events = OCP `pages` L226-230.
- Non-blocking: re-run the probe against the OCP ref when :9000 is back (no layout risk seen).

## Handover notes
- Files: `registry/kinds/horizontalpodautoscalers.tsx`; `workloads/hpa/metrics.ts` (pure row builder, `metricRows`),
  `MetricsTable.tsx`, `metrics.test.ts`, `hpa.test.tsx`. Outside `paths`: `registry/kinds/kinds.test.tsx` `findRow` takes
  the first "worker" link (the new Scale target link shares the name). Full gate green (EditMetadataModals flake passes alone).
- Deviations from the contract, all to match OCP `hpa.tsx` on main:
  - List has no Created column (OCP L318-343 has none; it lists the kebab only).
  - Resource row reads "Resource cpu" + subtle "(as a percentage of request)", current "35% (35m)" (OCP
    `resourceRowFn`/`getResourceUtilization`); the old "resource cpu on pods" copy is from OCP 3.x. Pods row: "<name> on pods".
  - Missing current/target renders "-" (OCP `MetricsRow`), not "not available".
- Kept from the contract: currents matched by type + name (OCP pairs by index, wrong once a metric is missing).
  Object rows link `describedObject` (OCP links the scale target there, a bug).
- Scale target uses `ObjectReferenceLink` (registry lookup; badge + plain name if the kind isn't registered).
- PO note: OCP's "Edit/Remove HorizontalPodAutoscaler" (dev-console HPA actions on Deployment/DC) are out of CP4b.
- UI probe pending: run `scripts/ui-probe.mjs` on the HPA list/details once :5199 and the OCP ref are usable.
