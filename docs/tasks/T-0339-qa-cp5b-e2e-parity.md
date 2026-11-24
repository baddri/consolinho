---
id: T-0339
title: CP5b QA — Playwright for nodes/overview/operators, fake apiserver additions, AC verification
status: todo
owner: qa-engineer
checkpoint: 5b
depends_on: [T-0330, T-0331, T-0332, T-0333, T-0334, T-0335, T-0336, T-0337, T-0338, T-0341]
paths: [web/e2e/, docs/architecture/ocp-parity.md]
review_rounds: 0
---

## Goal
QG5B-1/2 verification: run the gates, write the Playwright flows against the fake apiserver, tick the §5b ACs.

## Scope
- In: e2e for NODE-5 (RW marks unschedulable — modal names the cluster — and schedulable again; RO sees disabled
  actions), Overview four cards and the `prod-k8s-1`-style Kubernetes degradation, Installed Operators list +
  Subscription tab; extend the fake apiserver (new file next to T-0341's `fakeClusterHealth.ts`, e.g.
  `fakeComputeApi.ts`: node PATCH, pods by `spec.nodeName`, CSVs/Subscriptions, Infrastructure, events) — keep
  `fakeKubeApi.ts` edits to hook lines.
- Out: Api tests for NODE-5 (done in T-0324).

## Context pack
- Docs: spec §5b.6; T-0311 (CP5a QA shape).
- Touch points: `web/e2e/support/fakeKubeApi.ts`, `fakeWorkloadsApi.ts`, `fakeClusterHealth.ts` (T-0341).

## Acceptance criteria
- [ ] QG5B-1: `scripts/check-fe.sh` and `scripts/check-be.sh` green; FE unit tests listed in QG5B-1 exist (node status, shared health table, OLM-1 selector).
- [ ] QG5B-2: Playwright flows above green and stable (3 consecutive runs).
- [ ] Every §5b AC ticked or a bug task filed; parity rows from T-0338 cross-checked.

## Work log

## Review

## Handover notes
