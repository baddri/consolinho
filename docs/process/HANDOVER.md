# HANDOVER — live project state

> Updated by the orchestrator after every completed task and at session end. Keep it short; details belong in task files.

**Last updated:** 2026-11-18 · **Current checkpoint:** CP0 — Foundations · **Branch:** `cp/0-foundations`

## Where we are
- Project operating system in place (CLAUDE.md, architecture docs, ADR-0001..0007, SDLC, ROADMAP, agents, skills).
- **New human requirement:** login via host-cluster OpenShift OAuth → ADR-0007 (supersedes 0005), ROADMAP CP1 updated.
  Dev uses an in-repo OCP OAuth emulator `FleetConsole.DevOAuth` (to be built in CP1).
- CP0 loop step: **VERIFY** — all build tasks done; qa-engineer running against `docs/specs/CP0-foundations.md`.

## In flight
| Task | Status | Owner | Note |
|---|---|---|---|
| T-0001 | done | — | 41186c3 |
| T-0003 | done | — | c0052f0; follow-ups in its Review (route code-splitting, DOM lint gaps) |
| T-0002 | done | — | 1aa4e22 (2 review rounds) |
| T-0004 | done | — | 93546ef (2 review rounds); CP1 follow-ups in its Review |
| T-0005 | done | — | 7f56643; also fixed web default Api port 5000→5180 |

## Next actions
1. VERIFY: qa-engineer against `docs/specs/CP0-foundations.md` → report `docs/specs/CP0-qa-report.md`.
2. Fix any QA bug tasks (review + commit each).
3. CLOSE: merge `cp/0-foundations` → main, tag `cp-0`, ROADMAP CP0 done, stop and report.

## Needs human
- (none)

## Gotchas
- No docker on the dev machine: use podman (see CLAUDE.md "Podman notes").
- Aspire packages pinned to 13.6.5 (13.6.4 has advisory GHSA-f7vh-h5g3-7jrh). Aspire 17 exists — upgrading needs an ADR.
- Test projects must reference `xunit.v3.mtp-off` (not `xunit.v3`) so `dotnet test FleetConsole.slnx` keeps working on the .NET 10 SDK.
- Health endpoints (and possibly `/openapi`) are Development-only — revisit for OpenShift probes (CP3).
- Root namespace is `FleetConsole`; avoid `System` as a folder/namespace segment (shadows `System.*`).
- Background runs: `aspire start --launch-profile http && aspire wait web`, stop with `aspire stop`. Fish shell: use `$(id -u)` not `$UID`.
- API JSON uses strict number handling (quoted numbers → 400).
- CP1 design inputs (from T-0004 review): audit = post-commit dispatch vs outbox (ADR); OAuth callback under `/api/auth/...` (Vite proxies only `/api`); decide if `/api/system/info` stays anonymous.
- Endpoint/DTO XML docs flow into OpenAPI → `schema.gen.ts`; write them for API consumers.
