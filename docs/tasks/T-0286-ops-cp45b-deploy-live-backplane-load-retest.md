---
id: T-0286
title: Deploy CP4.5b to consolinho, show cross-pod revoke live (OPS-2), re-run the k6 load test (OPS-3)
status: todo
owner: orchestrator
checkpoint: 4.5b
depends_on: [T-0285]
paths: [deploy/loadtest/, deploy/kustomize/base/deployment.yaml, deploy/kustomize/base/hpa.yaml, docs/ops/, docs/tasks/T-0286-ops-cp45b-deploy-live-backplane-load-retest.md]
review_rounds: 0
---

## Goal
OPS-2 and OPS-3: prove the backplane on the real 3-replica deployment and measure what the cache bought against the
T-0242 baseline (p95 71 ms, Postgres CPU peak 177m); change requests/HPA only if the data says so.

## Scope
- In: `scripts/deploy-dev.sh` deploy to namespace `consolinho` on the current `oc` login (derive cluster facts live),
  the live revoke check, the k6 run with the **unchanged** `console-mix.js` mix, a results note.
- Out: code changes (file tasks); modelling watch/exec streams (spec §6); ReadyToRun (backlog); the disconnected prod
  cluster (human-run, see Handover).

## Contract / design notes
- OPS-2: with ≥ 2 server pods Ready and `redis` Degraded=false, sign in as a test user with one grant; pin requests to
  pod A and pod B in turn (port-forward each pod, or route cookie per pod) and warm both; revoke on A through the admin
  UI/API; the next request on B is refused at once (not after `Cache:Duration`). Record the commands/output in the Work log.
- OPS-3: same Job (`deploy/loadtest/job.yaml`), same VUs/duration as T-0242; record p95/p99, error rate, server CPU,
  Postgres CPU peak **and per request**, Redis CPU/memory; compare in a table next to the baseline in `docs/ops/`
  (where T-0242 put its numbers). Only adjust `deployment.yaml` requests / `hpa.yaml` if justified by the table.
- Never mutate anything outside `consolinho`; read-only `oc` elsewhere.

## Context pack
- Docs: `docs/tasks/T-0242-ops-size-requests-hpa-load-test.md` (Work log + Handover: method and baseline);
  `docs/ops/RUNBOOK.md` (deploy + Redis Secret section from T-0284); memory: deploy each closed checkpoint to consolinho.
- Touch points: `deploy/loadtest/console-mix.js`, `deploy/loadtest/job.yaml`, `scripts/deploy-dev.sh`.

## Acceptance criteria
- [ ] Deployed; all server pods and Redis Ready; `/health` Healthy (OPS-1 live).
- [ ] OPS-2 cross-pod revoke shown and recorded.
- [ ] OPS-3 table with baseline vs CP4.5b recorded; request/HPA change only with a stated reason.
- [ ] Spec CP4.5b VERIFY block updated for OPS-2/OPS-3.

## Work log

## Review

## Handover notes
