---
id: T-0286
title: Deploy CP4.5b to consolinho, show cross-pod revoke live (OPS-2), re-run the k6 load test (OPS-3)
status: done
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
- [x] Deployed; all server pods and Redis Ready; `/health` Healthy (OPS-1 live).
- [x] OPS-2 cross-pod revoke shown and recorded.
- [x] OPS-3 table with baseline vs CP4.5b recorded; request/HPA change only with a stated reason.
- [x] Spec CP4.5b VERIFY block updated for OPS-2/OPS-3.

## Work log
- 2026-11-25 (qa): `deploy-dev.sh --yes` @ b2d79ed ok (created Secret consolinho-redis). Redis image pulled in 16.6 s;
  `rhel9/redis-7:1` = manifest list `sha256:17f5b4c1…dea7` (amd64 `sha256:b61ae22d…7720`), pinned in dev/prod/production
  overlays; `check-deploy.sh` ok. 3/3 server pods + redis Ready, `/health` Healthy on the Route and on each pod (OPS-1).
- 2026-11-25 (qa): BLOCKED on OPS-2/OPS-3: they need a console session; the cluster has no IdP besides kube:admin
  (password unknown to agents; oauth-server ignores bearer at /oauth/authorize -> /login). Need a human Cookie header.
- 2026-11-25 (orch): OPS-2 PASS 00:29 on pods A=…dmfsj/B=…dtws2: revoke on A 204, B answered 404 `Proxy.NotAvailable`
  1.35 s later (5/5), restore 201 → both 200. Mutating curl needs `X-Console-Request: 1`.
- 2026-11-25 (orch): `console-mix.js` fixed: a fixed Cookie header made every request revalidate (renewed cookie never
  returned). Now seeds only `FleetConsole.Session` into each VU's jar + `noCookiesReset: true` (k6 clears jars per
  iteration). OPS-3 below is the valid run (HPA pinned 3/3 like T-0242, restored to 3/6 after).

### OPS-3 (same Job, mix, 5/20/40/80/120 req/s × 2 min; HPA 3/3)
| | T-0242 baseline | CP4.5b |
|---|---|---|
| requests / errors | 35 950 / 0 | 35 950 / 0 |
| p95 / p99 | 71 / 106 ms | 72 / 107 ms |
| server CPU per pod (5/20/40/80/120) | ~30/83/133/264/373m | ~16/51/95/168/218m |
| Postgres CPU (5→120) | peak 177m | 8/8/9/10/14m |
| Redis | — | ~5m CPU, 6 MiB |

40 req/s probe, `pg_stat_user_tables` delta over 5 600 requests: grants/clusters/credentials 6 scans each (≈ one per
30 s TTL), users 876 (`/me` + per-VU revalidation), user_group_checks 153 updates. Latency is upstream-bound and
unchanged; Postgres load is gone. No request/HPA change: the server limits keep headroom; revisit at CP5 sizing.

## Review

## Handover notes
