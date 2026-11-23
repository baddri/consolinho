---
id: T-0186
title: CP4a e2e (actions, logs, terminal) and OCP parity rows
status: todo
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
- [ ] QGA-2: e2e green locally against Aspire; artifacts on failure.
- [ ] QGA-3: parity rows added with OCP path + status.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
