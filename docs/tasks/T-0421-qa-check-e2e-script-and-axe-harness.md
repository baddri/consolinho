---
id: T-0421
title: scripts/check-e2e.sh gate + @axe-core/playwright harness
status: todo
owner: qa-engineer
checkpoint: 6b
depends_on: []
paths: [scripts/check-e2e.sh, web/package.json, web/package-lock.json, web/e2e/support/axe.ts, web/playwright.config.ts, docs/process/SDLC.md, docs/architecture/FRONTEND.md]
review_rounds: 0
---

## Goal
Make the Playwright suite a one-command checkpoint gate like `check-fe.sh`, and add the axe helper later tasks use.
Spec CP6 **E2E-1, E2E-4**, infra for **A11Y-1** (size **S**).

## Contract / design notes
- `scripts/check-e2e.sh [playwright args]`: same structure as `scripts/check-fe.sh` (ROOT, per-run `$LOGS` dir,
  keep newest 20, `step`). Reuses a running stack (`aspire describe web` succeeds) else runs
  `aspire start --launch-profile http && aspire wait web` and stops it on exit only if it started it (trap). Exports the
  podman env from CLAUDE.md if unset. Prints `E2E: ok|FAILED`, the passed/failed/flaky counts, the failing test titles
  (≤ 30 lines), the a11y summary line and the full-log path. `-h` documents `E2E_KIND=1` (kind spec opt-in, E2E-4) and `E2E_BASE_URL`.
- Add devDependency `@axe-core/playwright` (exact version, like `@playwright/test`).
- `web/e2e/support/axe.ts`: `scanA11y(page: Page, name: string, opts?: { include?: string; disableRules?: string[] }): Promise<void>`
  — `AxeBuilder` with tags `wcag2a, wcag2aa, wcag21a, wcag21aa`; appends `{ name, theme, violations[] }` to
  `e2e/.results/a11y/<name>.json`; `expect` zero `serious`/`critical` (message lists rule id + target); moderate/minor only
  recorded. `writeA11yReport()` (global teardown) merges the JSON into `e2e/.results/a11y-report.md` (table: page, rule,
  impact, count) and prints one summary line.
- SDLC.md checkpoint loop step VERIFY: name `scripts/check-e2e.sh` as the gate (one line). FRONTEND.md § Testing: replace
  "E2E (later)" with the real setup (2 lines).

## Context pack
- Exemplar: `scripts/check-fe.sh` (whole, 25 lines). `web/playwright.config.ts:resolveBaseUrl` (aspire describe),
  `globalSetup` L37; add `globalTeardown`.
- `web/e2e/global-setup.ts` L24 (baseURL error message).

## Acceptance criteria
- [ ] With the stack down, `scripts/check-e2e.sh` starts it, runs the suite, stops it; with it up, reuses it (log shows which).
- [ ] A deliberately failing test prints its title and the log path; exit code non-zero.
- [ ] `scanA11y` demo call on the login page writes the JSON and the merged report.
- [ ] `-h` mentions `E2E_KIND=1`; `kubernetes.e2e.ts` still skips without it. `scripts/check-fe.sh` green.

## Work log

## Review

## Handover notes
