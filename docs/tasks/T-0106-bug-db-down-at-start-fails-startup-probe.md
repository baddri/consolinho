---
id: T-0106
title: "label: bug — with Postgres down at pod start, /alive answers only after ~61 s, so the startup probe restarts the pod"
status: done
owner: backend-engineer
checkpoint: 3
depends_on: []
paths: [deploy/kustomize/base/deployment.yaml, src/FleetConsole.Infrastructure/Crypto/DataProtectionSetup.cs, src/FleetConsole.Infrastructure/Crypto/KeyRingWarmupService.cs, src/FleetConsole.Infrastructure/DependencyInjection.cs, src/FleetConsole.Api/Program.cs, tests/FleetConsole.Api.Tests/Integration/Hosting/ProductionProbeTests.cs, docs/ops/RUNBOOK.md]
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
- [x] With the DB unreachable (refused and dropped), the server answers `/alive` before the startup probe budget ends
      (test or `scripts/check-image.sh` step), and `/health` is 503 within the readiness timeout or the pod is NotReady.
- [x] When the DB comes back the pod becomes Ready without a restart.
- [x] RUNBOOK troubleshooting row updated if behaviour/timings change.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-21 backend-engineer: in_progress. Repro'd in WAF test (~2 min). Fix: framework `DataProtectionHostedService`
  (sync key-ring load before Kestrel) removed last before `Build()` and replaced by `KeyRingWarmupService` (thread-pool,
  failure logged, abandoned on shutdown); DB health check `Timeout` 2 s (< readiness 3 s). Probes unchanged. Tests:
  refused + dropped DB → `/alive` 200 < 15 s, `/health` 503 < 3 s; recovery → 200 without restart. check-be green. in_review.

## Review
**APPROVE** (backend-architect, 2026-11-21, round 1). check-be green 325/684/768.
- Ordering fragility: guarded — `ProductionProbeTests.KeyRingLoad_IsNotOnTheStartupPath` builds the real `Program`, so a
  later `AddDataProtection`/`AddAuthentication` fails it; the helper throws on a framework rename. OK.
- Security: encryptor/decryptors are options, applied on every load; first key still created cert-encrypted; a failed
  read throws (no "empty ring → new key"); in-process key-ring lock unchanged; cross-replica first-key race identical to
  the framework warm-up (benign). Dev migrator still starts before the warm-up (registration order). OK.
- Decisions recorded: ADR-0027 amendment (new pod in `Init:CrashLoopBackOff` during outage accepted, no longer retry in
  `migrate`); ADR-0028 amendment (background key-ring load, 2 s DB check timeout, ~60 s DP wait on a NotReady pod accepted).
- Optional: `src/FleetConsole.Infrastructure/DependencyInjection.cs:31,37` — `DatabaseHealthCheckName`/`…Timeout` are
  public but used only inside the class — make them `private`/`internal`.
- Optional: `tests/.../Hosting/ProductionProbeTests.cs` — the "dropped" case fails fast where TEST-NET has no route, so the
  2 s timeout is only exercised on some hosts; a cheap assertion on `HealthCheckServiceOptions` registration `Timeout`
  would pin it everywhere.

## Handover notes
- `builder.LoadDataProtectionKeyRingInBackground()` must stay the last call before `Build()` in Program.cs: every
  `AddDataProtection` (incl. `AddAuthentication`) re-adds the framework's blocking hosted service. It throws if that
  internal type is not found (framework rename); `KeyRingLoad_IsNotOnTheStartupPath` guards the result.
- DP unchanged otherwise: same encryptor/decryptors on every load; the warm-up's Protect creates the first key
  encrypted, exactly like the framework warm-up did.
- DB readiness check (`ConsoleDbContext`, from EnrichNpgsqlDbContext) now times out at 2 s → `/health` 503 promptly.
- During an outage, requests that need DP (session cookie) wait on the key-ring lock while a load is retrying (≤ ~60 s,
  EF retries); not a liveness concern (`/alive` uses no DP).
- Open (architect): a *new* pod during a DB outage waits in `Init` because the `migrate` init container fails and
  retries (Init:CrashLoopBackOff); the server container itself no longer restarts. Documented in RUNBOOK §9.
