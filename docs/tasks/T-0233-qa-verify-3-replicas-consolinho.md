---
id: T-0233
title: Verify the 3-replica HPA deployment on consolinho (sessions, credentials, streams, scale-down)
status: todo
owner: qa-engineer
checkpoint: 4c
depends_on: [T-0230, T-0231]
paths: [docs/tasks/T-0233-qa-verify-3-replicas-consolinho.md, docs/ops/RUNBOOK.md]
review_rounds: 0
---

## Goal
Prove on the dev cluster (namespace `consolinho`, current `oc login`, `scripts/deploy-dev.sh`) that FleetConsole is
correct at 3+ replicas (ADR-0030 § Amendment 2026-11-24). Evidence-only; defects become bug tasks.

## Scope
- In: deploy with `scripts/deploy-dev.sh`; read-only `oc get/describe/logs`; deleting **our own** consolinho pods in
  namespace `consolinho` (the only mutation besides the script); browser/Playwright checks against the Route.
- Out: any mutation of other namespaces or clusters (CLAUDE.md rule 6); load testing to reach `maxReplicas`.

## Contract / design notes
Checks (record command + one-line result each in the Work log):
1. `oc get hpa consolinho` → MINPODS 3, MAXPODS 6, TARGETS shows a CPU % (not `<unknown>` after ~2 min); 3 pods Ready,
   spread over ≥ 2 nodes if the cluster has them; `oc get pdb consolinho` ALLOWED DISRUPTIONS 1.
2. Init containers: `oc logs <pod> -c migrate` on all 3 — exactly one applied migrations (or all "up to date"), no 42P07.
3. Session across pods: log in, then delete the pod that served the login (find it via logs); the session survives
   and admin pages work (cookie readable by the others).
4. Credentials across pods: an SA token saved via the admin UI is used successfully by requests served by every pod
   (repeat a cluster list page ≥ 10 times; check each pod's logs for no "key not found"/CryptographicException).
5. Streams: open a pod Terminal and a followed log; delete the pod serving it → the session closes cleanly (SPA shows
   closed/reconnect), a new one opens on another pod; audit shows the exec entry once.
6. Audit: a scale action appears once in the audit log regardless of the serving pod.
7. `oc get deploy consolinho -o jsonpath='{.spec.replicas}'` equals the HPA's desired count (no fight with apply).

## Context pack
- Docs: ADR-0030 § Amendment (2026-11-24); RUNBOOK § dev deploy; memory note: derive cluster facts live (the cluster changes often).
- Touch points: `scripts/deploy-dev.sh` summary (prints route + HPA replicas after T-0230).

## Acceptance criteria
- [ ] Checks 1–7 pass with evidence in the Work log, or each failure filed as a bug task (linked here).
- [ ] RUNBOOK corrected if a documented command was wrong.

## Work log

## Review

## Handover notes
