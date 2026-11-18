# HANDOVER — live project state

> Updated by the orchestrator after every completed task and at session end. Keep it short; details belong in task files.

**Last updated:** 2026-11-18 · **Current checkpoint:** CP1 — Identity & administration · **Branch:** `cp/1-identity-admin`

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
| T-0009 | in_review | backend-architect | DevOAuth emulator; 40 contract tests |
| T-0010 | in_progress | backend-engineer | k8s probe client + fake apiserver (W1) |
| T-0008 | in_progress | backend-engineer | Domain clusters/credentials/grants (W2) |
| T-0022 | in_progress | frontend-engineer | FE API foundations (F1) |
| next | todo | | T-0011 (after T-0007, W2); T-0026 (F1); then follow waves in task files |

## Next actions (CP1)
1. DESIGN: `backend-architect` + `frontend-architect` (parallel) → ADRs + tasks T-0007+. Inputs they must address:
   - audit: post-commit event dispatch vs outbox (ADR); integration test of domain-event dispatch with first aggregate (QA R5)
   - OAuth callback under `/api/auth/...` (Vite proxies only `/api`); DevOAuth emulator project in AppHost + in-process for tests
   - backend CSRF filter on `/api` non-GET + test (QA R2); decide whether `/api/system/info` stays anonymous (QA R3)
   - replace temporary `IRequireRole.RequiredRole: string` / `ICurrentUser.UserId: Guid?` with domain types
   - HTTP-level validation/malformed-body tests with first command endpoint (QA R6)
2. BUILD → VERIFY → ACCEPT (product owner) → CLOSE per `docs/process/SDLC.md`.

## Needs human
- (none) — optional: confirm product name "FleetConsole" before CP3 (image/Route names).

## Gotchas
- No docker: podman. Export `DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ASPIRE_CONTAINER_RUNTIME=podman` (fish: `$(id -u)`, not `$UID`).
- Background runs: `aspire start --launch-profile http && aspire wait web`; stop with `aspire stop`. Api on :5180; web port changes per run (`aspire describe`).
- Aspire pinned to 13.6.5 (advisory on 13.6.4). CLI offers 17 — don't `aspire update`; needs an ADR.
- Test projects must use `xunit.v3.mtp-off`.
- `/health`, `/alive`, `/openapi/v1.json` are Development-only — revisit for OpenShift probes (CP3, QA R1).
- Never name a folder/namespace after a BCL root (`System`, …). DTO `Dto` suffix is stripped in OpenAPI schema names.
- Endpoint/DTO XML docs flow into OpenAPI → `schema.gen.ts`; regenerate with `cd web && npm run gen:api` (Api running).
- API JSON uses strict number handling (quoted numbers → 400).
- DbContext uses retrying execution strategy: explicit transactions must run inside `CreateExecutionStrategy().ExecuteAsync`.
- Frontend follow-ups: route code-splitting (bundle 574 kB), DOM lint gaps (`globalThis.document`), dev-only npm audit findings (QA R7).
