---
id: T-0259
title: QA — CP4.5a backend security and precedence verification (QG-3, PREC, EFF-3)
status: todo
owner: qa-engineer
checkpoint: 4.5a
depends_on: [T-0255, T-0256, T-0257]   # wave 4; the Playwright e2e QG-2 is the FE/QA lane (T-026x)
paths: [tests/FleetConsole.Api.Tests/Integration/Security, docs/specs/CP4.5-acceptance.md]
review_rounds: 0
---

## Goal
Independent check that the CP4.5a backend meets the security gates and the precedence rules end to end, through the
HTTP surface only, and that the admin view equals what the user gets (EFF-3).

## Scope
- In: Api integration tests (black-box, `LoginAsAsync`), a CP4.5a backend section in `docs/specs/CP4.5-acceptance.md`
  mapping every GRP/PREC/GPG/EFF ID to a test or task AC, bug tasks for failures (next free T-id after the FE range).
- Out: Playwright (QG-2), Redis/cache gates (QG-4, CP4.5b).

## Contract / design notes
Contract: `docs/specs/CP4.5-api-contract.md`. Security tests (`Integration/Security/GroupAccessSecurityTests.cs`):
- QG-3a / GRP-3: `system:authenticated`, `SYSTEM:masters`, ` system:x ` → 400 on create, bulk and (via a user-grant
  attempt) never accepted; a user whose DevOAuth groups include `system:*` gets nothing from them (no grant can exist;
  also assert `/api/auth/me` and Effective access don't list them).
- QG-3b / PREC-1: removal via `DevGroupMembership.SetGroups` → 403 after the interval; host unreachable during
  revalidation → member of a granted group signed out, direct-only user kept (ADR-0039 §3).
- QG-3c / PREC-6: RO user in a RW group → mutation through the proxy refused before forwarding; Effective access shows
  `narrowedByReadOnlyFlag`.
- PREC-3/4 through the proxy: assert **which credential's token** reaches the stubbed cluster (fake tokens per credential).
- EFF-3: random-ish fixture (3 clusters × direct/group mixes) — Effective access set/modes == `GET /api/clusters`.
- Leak checks: group listing responses and logs contain no SA token (`TokenLeakScanner`).

## Context pack
- Docs: spec §4.1/4.2/4.5/4.8 (grep IDs); ADR-0034, ADR-0039.
- Exemplars: `tests/FleetConsole.Api.Tests/Integration/SessionRevalidationTests.cs`; one proxy test under `Integration/Proxy/`.
- Touch points: `TestData.cs` (group grant helper from T-0252), `TestOAuthServer` / `DevGroupMembership` (T-0254), `OpenShiftHostStub`.

## Acceptance criteria
- [ ] QG-3 (a, b, c) tests green; PREC-3/4 credential assertion green; EFF-3 parity green.
- [ ] `docs/specs/CP4.5-acceptance.md` CP4.5a backend table: every GRP/PREC/GPG/EFF ID → test name or task AC, status.
- [ ] Failures filed as bug tasks; `scripts/check-be.sh` green.

## Work log

## Review

## Handover notes

## Follow-ups from T-0253 review
- Add a handler-level (AuthorizeProxyRequest) test: a stored `system:authenticated` group grant plus membership → NotAvailable (QG-3 is only covered by Domain resolver tests today).
- PREC-1 end-to-end (deferred from T-0255): after a host group change is picked up at revalidation, the proxy returns 403 and `GET /api/clusters` drops the cluster.
- Fix the stale comment in `Infrastructure/Persistence/Configurations/UserConfiguration.cs` ("groups never queried by element"; T-0253 now queries `= ANY (u.groups)`).
