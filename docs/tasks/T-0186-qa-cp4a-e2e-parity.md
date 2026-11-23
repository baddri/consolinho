---
id: T-0186
title: CP4a e2e (actions, logs, terminal) and OCP parity rows
status: done
owner: qa-engineer
checkpoint: 4a
depends_on: [T-0170, T-0171, T-0172, T-0173, T-0174, T-0175, T-0176, T-0177, T-0178, T-0179, T-0180, T-0181, T-0182, T-0183, T-0184, T-0185]
paths: [web/e2e/workloads.e2e.ts, docs/architecture/ocp-parity.md]
review_rounds: 0
---

## Goal
QGA-2/3: end-to-end proof of CP4a against the real Api + DevOAuth (BE deps: dev seed prod-k8s-1, exec WebSocket relay
+ cap + audit, follow-log lifetimes, mutation guard on PATCH/exec) and parity rows for every new CP4a screen.

## Scope
- In: Playwright spec covering edit labels, scale via modal + ring, pause/resume, restart, rollback, logs follow +
  resume, terminal echo (`echo hi`), RO user sees disabled actions and the TERM-4 copy, production modal naming;
  `ocp-parity.md` rows (Logs, Terminal, modals, ReplicaSets tab, status popover).
- Out: fixing defects (file bug tasks).

## Context pack
- Exemplars: existing `web/e2e/*.e2e.ts` (one file; login helper, cluster switch); `docs/architecture/ocp-parity.md` row format.
- OCP reference: as in T-0179/T-0180/T-0182/T-0185.

## Acceptance criteria
- [x] QGA-2: e2e green locally against Aspire; artifacts on failure.
- [x] QGA-3: parity rows added with OCP path + status.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 qa: `web/e2e/workloads.e2e.ts` + stateful HTTPS fake (`support/fakeWorkloadsApi.ts`, WebSocket exec in
  `support/webSocket.ts`); asserts UI and what reached the cluster with which SA token. Aspire: 9 passed, 2 fixme
  (T-0187, T-0188); whole e2e suite 19 passed. `check-fe.sh` green (1018 tests). Parity: 10 CP4a rows in `ocp-parity.md`.

## Review

## Handover notes
- Spec registers its own production cluster `e2e-smoke-prod-*` ("E2E Production") against an in-process fake kube API
  (self-signed TLS, `skipTlsVerify`); bob = readWrite grant (editor SA), alice = readOnly grant (viewer SA, writes 403).
- Covered: ACT-2 labels, DEP-4 modal scale, DEP-5 ring (debounce → 1 PATCH), DEP-6/7 pause/resume/restart, DEP-10
  rollback, LOG-3/5 follow/pause/resume/previous, TERM-1/2 echo, RO disabled actions + reason, TERM-4 (no socket).
- `test.fixme`: T-0187 (Edit <Kind> enabled for RO, ACT-4) and T-0188 (RO ring arrows aria-disabled, DEP-5/OCP omit
  them); remove each fixme when its bug lands.
- Not in e2e: Edit update strategy modal, pod status popover (MSW tests only; parity rows say so).
- `DevUser` in `e2e/support/session.ts` gained `bob`; `selfSignedCertificate` now exported from `fakeKubeApi.ts`.
- Unit suite showed 5s timeouts in EditMetadataModals/projectSelector under load avg ~20 (green in isolation and on rerun).
