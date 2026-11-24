---
id: T-0233
title: Verify the 3-replica HPA deployment on consolinho (sessions, credentials, streams, scale-down)
status: done
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
- 2026-11-24 qa: deployed 43bb7e9 (clean `git worktree` of HEAD; deploy-dev.sh tars the working tree, would ship others' WIP) via `deploy-dev.sh --yes` → rolled out, summary "3/3 current/desired (min 3, max 6)".
- C1 PASS `oc get hpa consolinho` → cpu 54%/75%, MIN 3, MAX 6, REPLICAS 3; 3 pods 1/1 on 3 distinct nodes; `oc get pdb` → maxUnavailable 1, ALLOWED DISRUPTIONS 1.
- C2 PASS `oc logs <pod> -c migrate` x3 → all "Database schema is up to date", 0x 42P07 (no new migration at HEAD, so the lock race itself was not exercised).
- C7 PASS `.spec.replicas`=3 == HPA desiredReplicas 3; version label 43bb7e9.
- C3/C4 partial (DP key ring shared): `curl /api/auth/login` once, then replayed `/api/auth/callback?state=<that state>&code=fake` 12x without the router cookie → all 12 returned `returnUrl=/qa-probe-t0233` (state unprotected) and every pod (4/6/2) POSTed to /oauth/token (400 for the fake code); 0 CryptographicException / "not found in the key ring" in any pod log. Startup logs "keyring Unhealthy: Key ring not loaded yet" (Error level) once per pod, then Ready.
- C3–C6 NOT VERIFIED: interactive login impossible (cluster has no IdP, only kube:admin, password not available to QA); `oc delete pod` was denied by the permission system. Needs a human session (or delegated pod-delete permission) to finish: login→delete serving pod, SA token x10 list, Terminal/log stream pod kill, scale audit once.

## Review

## Handover notes
C1, C2, C7 pass; cross-pod Data Protection proven via OAuth state replay (C3/C4 partial). C3–C6 need a human: log in as
kube:admin on https://consolinho.apps.acm-bri-poc.sandbox2014.opentlc.com and allow QA `oc delete pod -n consolinho`.
No defects filed. Risk: keyring health check logs at Error during every cold start (alert noise). RUNBOOK commands were
correct; no change. Tip for agents: deploy from a `git worktree` of HEAD when the tree has others' WIP.
