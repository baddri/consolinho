---
id: T-0242
title: Size server CPU/memory requests and tune the HPA from a load test on consolinho
status: done
owner: orchestrator
checkpoint: 4.5
depends_on: [T-0230, T-0233]
paths: [deploy/kustomize/base/deployment.yaml, deploy/kustomize/base/hpa.yaml, deploy/loadtest/, docs/ops/]
review_rounds: 0
---

## Goal
The human saw the HPA scale 3 → 5 right after the cp-4c deploy while nobody was loading the console (2026-11-24). Size the
server container's requests from measured usage and tune the HPA so that rollouts and JIT warm-up don't trigger
scale-ups, but real load still does.

## Findings before the test (Prometheus, 2026-11-24)
- Fresh pods burn 100–195m CPU for 2–3 min after start (JIT/tiering, key-ring warm-up), then idle at 1–5m, and 10–35m
  while one user browses. Request 100m at a 75 % target = 75m, so every rollout's warm-up counts as load
  (HPA event 10:15 "cpu above target", 3 → 5).
- Memory working set: 95–175 MiB, rising slowly after start, then flat. Request 256Mi, limit 768Mi.

## Scope
- In: an in-cluster k6 load test (authenticated proxy + SPA mix) with HPA pinned to measure per-pod CPU per req/s;
  set requests, HPA target and scale-up stabilisation from the results; decide on a memory metric; document how to re-run.
- Out: app-level performance work (filed as follow-ups if the test finds hot spots).

## Acceptance criteria
- [x] Load test run on consolinho; per-pod CPU/memory versus req/s and p95 latency recorded here
- [x] Requests and HPA changed from the data, with the reasoning in comments next to the values
- [x] A rollout no longer scales the deployment up (verified on consolinho)
- [x] `scripts/check-deploy.sh` green

## Work log
- 2026-11-24 (orchestrator): k6 Job (`deploy/loadtest/`) on consolinho, HPA pinned 3/3, cookie from the human (Secret
  deleted after). Per pod at 5/20/40/80/120 req/s total: ~30/83/133/264/373m CPU; memory 130–175 MiB flat; Postgres
  peak 177m. 35 950 req, 0 errors, p95 71 ms, p99 106 ms. → request 250m, target 70 %, scale-up window 180 s
  (ADR-0030 amendment T-0242). Redeployed 10:50: HPA stayed at 3 through warm-up (cpu ≤ 18 %/70 % for 6 min, no rescale event).

## Handover notes
- Follow-ups: ReadyToRun publish to cut the warm-up spike and cold latency; re-run the test after the CP4.5
  authorization cache (Postgres CPU per request should drop). The test doesn't model long-lived watch/exec streams.
