---
id: T-0195
title: HorizontalPodAutoscalers — list, details with metrics table
status: todo
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
- [ ] HPA-1: list shows Name, Namespace, Labels, Scale target link, Min/Max pods for `worker` (test).
- [ ] HPA-1: details show the OCP fields and a metrics row "resource cpu on pods" 35 % / 80 % (test); tabs Details, YAML, Events.
- [ ] `metrics.ts` unit tests cover Resource utilization, Resource average value, Pods metric, missing current.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
