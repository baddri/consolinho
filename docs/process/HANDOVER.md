# HANDOVER — live project state

> Updated by the orchestrator after every completed task and at session end. Keep it short; details belong in task files.

**Last updated:** 2026-11-18 · **Current checkpoint:** CP1 — Identity & administration (not started) · **Branch:** `main` (CP0 merged, tag `cp-0`)

## Where we are
- **CP0 Foundations: DONE** (tasks T-0001..T-0006, QA report `docs/specs/CP0-qa-report.md`, all 9 criteria met).
  Backend 137 tests, frontend 51 tests, `aspire run` verified incl. real browser.
- CP0 had no product-owner ACCEPT step (technical checkpoint, spec written by orchestrator).
- Human requirement recorded for CP1: login via **host-cluster OpenShift OAuth** (ADR-0007), dev uses in-repo emulator `FleetConsole.DevOAuth`.

## In flight
| Task | Status | Owner | Note |
|---|---|---|---|
| — | | | |

## Next actions (CP1)
1. `git switch -c cp/1-identity-admin` from main.
2. SPEC: `ocp-product-owner` writes `docs/specs/CP1-identity-and-admin.md` from ROADMAP CP1 (must include ADR-0007 login).
3. DESIGN: `backend-architect` + `frontend-architect` (parallel) → ADRs + tasks T-0007+. Inputs they must address:
   - audit: post-commit event dispatch vs outbox (ADR); integration test of domain-event dispatch with first aggregate (QA R5)
   - OAuth callback under `/api/auth/...` (Vite proxies only `/api`); DevOAuth emulator project in AppHost + in-process for tests
   - backend CSRF filter on `/api` non-GET + test (QA R2); decide whether `/api/system/info` stays anonymous (QA R3)
   - replace temporary `IRequireRole.RequiredRole: string` / `ICurrentUser.UserId: Guid?` with domain types
   - HTTP-level validation/malformed-body tests with first command endpoint (QA R6)
4. BUILD → VERIFY → ACCEPT (product owner) → CLOSE per `docs/process/SDLC.md`.

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
