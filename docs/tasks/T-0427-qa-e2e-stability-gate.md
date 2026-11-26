---
id: T-0427
title: E2E suite stability — three consecutive green full runs, flakes fixed or quarantined
status: todo
owner: qa-engineer
checkpoint: 6b
depends_on: [T-0423, T-0424, T-0425, T-0426, T-0128]
paths: [web/e2e, docs/tasks]
review_rounds: 0
---

## Goal
Spec CP6 **E2E-3** and the CP6b gate **QG6B-1** (size **S**): the full suite incl. the a11y scans is green three
times in a row via `scripts/check-e2e.sh`, so VERIFY can trust it.

## Contract / design notes
- Run the full gate 3× on a fresh stack; record pass/fail/flaky counts per run in the Work log.
- A flaky test is fixed (wait on state, not time; no `waitForTimeout`), or quarantined with `test.fixme()` + a new task
  (next free T-number) linked in a comment. No retries in `playwright.config.ts` (`retries: 0` stays).

## Context pack
- `web/playwright.config.ts` (serial, `workers: 1`, `retries: 0`); flake patterns already solved:
  `web/e2e/workloads.e2e.ts:L97-112` (Monaco find/Enter timing), FRONTEND.md § Testing (cold start).

## Acceptance criteria
- [ ] Three consecutive full green runs logged (counts + durations).
- [ ] Every quarantined test has a task. `scripts/check-fe.sh` green.

## Work log

## Review

## Handover notes
