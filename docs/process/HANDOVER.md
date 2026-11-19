# HANDOVER — live project state

> Updated by the orchestrator after every completed task and at session end. Keep it short; details belong in task files.

**Last updated:** 2026-11-19 · **Current checkpoint:** CP1 — Identity & administration · **Branch:** `cp/1-identity-admin`

## Where we are
- **CP0 Foundations: DONE** (tasks T-0001..T-0006, QA report `docs/specs/CP0-qa-report.md`, all 9 criteria met).
  Backend 137 tests, frontend 51 tests, `aspire run` verified incl. real browser.
- CP0 had no product-owner ACCEPT step (technical checkpoint, spec written by orchestrator).
- CP1 loop step: **BUILD**. Design complete: backend T-0007..T-0021 (waves W1–W7), frontend T-0022..T-0043 (groups F1–F10),
  ADR-0008..0017, contract `docs/specs/CP1-api-contract.md` (with orchestrator amendments 2026-11-18).
- Human requirement recorded for CP1: login via **host-cluster OpenShift OAuth** (ADR-0007), dev uses in-repo emulator `FleetConsole.DevOAuth`.

## In flight
| Task | Status | Owner | Note |
|---|---|---|---|
| T-0007 | done | — | 23817e0 (2 rounds; ADR-0017 promote ruling) |
| T-0009 | done | — | b90a5bc |
| T-0010 | done | — | committed (2 rounds; https-only enforced in adapter) |
| T-0011 | done | — | 72a46f8 (2 rounds) |
| T-0012 | done | — | 4c7f114 |
| T-0013 | done | — | merged 810565c (worktree removed) |
| T-0014 | in_review | backend-architect | login use cases + identity adapters (main tree) |
| T-0008 | done | — | 7d5d641 |
| T-0022 | done | — | 2baea45 |
| T-0026 | done | — | committed (2 rounds) |
| T-0023 | done | — | committed (2 rounds) |
| T-0024 | done | — | committed (2 rounds) |
| T-0044 | done | — | committed |
| T-0025 | done | — | committed (2 rounds) |
| T-0027 | in_review | frontend-architect | session, login page, 401 handling, user menu |
| next | todo | | after T-0013+T-0014 merged: T-0015 (W5), then W6 admin APIs (T-0016..T-0019, T-0021), then T-0020; FE: T-0027 (session/login) after T-0024+T-0025 |

## Next actions (CP1)
1. Finish W4: T-0014 → review → commit. Then T-0015 (W5).
2. Continue BUILD by waves (task files list `depends_on`); FE groups F3+ after F2.
3. VERIFY (qa-engineer) → ACCEPT (ocp-product-owner) → CLOSE per `docs/process/SDLC.md`.

## Needs human
- (none) — optional: confirm product name "FleetConsole" before CP3 (image/Route names).

## Gotchas
- Commit 6c2262f (T-0025) accidentally includes T-0027's staged deletion of `app/layout/UserMenu.tsx` → that single commit doesn't build alone; fixed by the T-0027 commit.
- Usage limits can stop agents mid-task: resume them with SendMessage (work on disk is kept), don't respawn.
- No docker: podman. Export `DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ASPIRE_CONTAINER_RUNTIME=podman` (fish: `$(id -u)`, not `$UID`).
- Background runs: `aspire start --launch-profile http && aspire wait web`; stop with `aspire stop`. Api on :5180; web port changes per run (`aspire describe`).
- Aspire pinned to 13.6.5 (advisory on 13.6.4). CLI offers 17 — don't `aspire update`; needs an ADR.
- Test projects must use `xunit.v3.mtp-off`.
- `/health`, `/alive`, `/openapi/v1.json` are Development-only — revisit for OpenShift probes (CP3, QA R1).
- Never name a folder/namespace after a BCL root (`System`, …). DTO `Dto` suffix is stripped in OpenAPI schema names.
- Endpoint/DTO XML docs flow into OpenAPI → `schema.gen.ts`; regenerate with `cd web && npm run gen:api` (Api running).
- API JSON uses strict number handling (quoted numbers → 400).
- DbContext uses retrying execution strategy: explicit transactions must run inside `CreateExecutionStrategy().ExecuteAsync`.
- Agent worktrees with no changes are auto-deleted when the agent stops (e.g. on a usage limit) — a resumed agent may find its worktree gone.
- Follow-up F1 (from T-0013 review): harden AuditEntry.Actor against shared instances (EF complex type or copy in `AuditEntry.Record`).
- Worktree tasks: reviewers review in the worktree path; orchestrator commits there and merges into `cp/1-identity-admin` (DI files may conflict trivially).
- CP3 follow-ups from T-0012 review: make DP-cert-missing warning (EventId 3200) a startup error in prod; support key-encryption cert rotation; ops runbook.
- CP2 follow-ups from T-0010: pooled handlers need a fresh `TlsValidationRecord` per connection; fake apiserver needs prefix routes + streaming bodies.
- CP3 follow-ups from T-0009 review: Containerfile must publish `src/FleetConsole.Api` only and assert no `FleetConsole.DevOAuth*` in image; optional: AppHost `IsRunMode` guard for devoauth, loopback-only `redirect_uri` in emulator.
- Frontend follow-ups: route code-splitting (bundle 574 kB), DOM lint gaps (`globalThis.document`), dev-only npm audit findings (QA R7).
