---
id: T-0106
title: "label: bug — with Postgres down at pod start, /alive answers only after ~61 s, so the startup probe restarts the pod"
status: todo
owner: backend-engineer
checkpoint: 3
depends_on: []
paths: [deploy/kustomize/base/deployment.yaml, src/FleetConsole.Infrastructure/Crypto/DataProtectionSetup.cs, docs/ops/RUNBOOK.md]
review_rounds: 0
---

## Goal
PRB-2 says a DB outage must not cause restarts and the startup probe must cover cold start. When Postgres is
unreachable while the server container starts, the host blocks before Kestrel binds: the Data Protection key ring is
read at startup (framework key-ring warm-up, `PersistKeysToDbContext`) and EF's retrying execution strategy waits
~60 s (6 retries, 0→30 s backoff) before giving up. The startup probe allows 2 s × 30 = 60 s, so the container is
killed and restarts in a loop (CrashLoopBackOff) until the DB is back. A DB that drops packets (connect timeout 15 s per
attempt) instead of refusing makes it much longer. PRB-3 (DB scaled to 0 while the pod runs) is not affected unless the pod
restarts for another reason during the outage (node drain, OOM, rollout).

## Repro (QA, 2026-11-21, local, no cluster)
Run `src/FleetConsole.Api/bin/Debug/net10.0/FleetConsole.Api.dll` with `ASPNETCORE_ENVIRONMENT=Production`, valid
fake OAuth/DP-cert/public-origin settings and `ConnectionStrings__consoledb=Host=127.0.0.1;Port=1;…`. Poll
`GET /alive` every 2 s.
- **Expected:** `/alive` answers 200 within a few seconds (process liveness only), `/health` 503 → pod NotReady, no restart.
- **Actual:** connection refused on 8080 for 61 s; log shows `An error occurred while reading the key ring.`
  (`RetryLimitExceededException`) and only then `Now listening on`. `/health` then takes ~58 s to answer 503.

## Context pack
- `deploy/kustomize/base/deployment.yaml` startupProbe (`periodSeconds: 2`, `failureThreshold: 30`).
- `src/FleetConsole.Infrastructure/Crypto/DataProtectionSetup.cs` (key ring in `ConsoleDbContext`); Npgsql retry
  settings from the Aspire `EnrichNpgsqlDbContext` defaults.
- ADR-0028 §2 (probes). Fix options (architect's call): don't block Kestrel on the key-ring read, cap the startup DB
  retry, and/or widen the startup probe budget well beyond the worst-case retry time — and document it.

## Acceptance criteria
- [ ] With the DB unreachable (refused and dropped), the server answers `/alive` before the startup probe budget ends
      (test or `scripts/check-image.sh` step), and `/health` is 503 within the readiness timeout or the pod is NotReady.
- [ ] When the DB comes back the pod becomes Ready without a restart.
- [ ] RUNBOOK troubleshooting row updated if behaviour/timings change.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
