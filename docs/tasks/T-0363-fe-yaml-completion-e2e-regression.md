---
id: T-0363
title: e2e QGC-1/OAPI-3 YAML tab completion shows "No suggestions" (CP4c regression?)
status: done
owner: frontend-engineer
checkpoint: 5a
depends_on: []
paths: [web/e2e/workloads.e2e.ts, web/src/shared/yaml, web/vite.config.ts]
review_rounds: 0
---

## Goal
T-0311 (2026-11-25): `workloads.e2e.ts` "QGC-1/OAPI-3: the YAML tab hovers a field description, completes spec children
and flags a wrong type" fails even when run alone, with completion showing "No suggestions". It passed at cp-4c (T-0223,
T-0239 fixed the monaco-yaml worker). Find the cause: a product regression (schema not loaded, worker, a CP5 change)
or a test/fake issue. Fix it at the root and add a guard if a unit test can catch it.

## Acceptance criteria
- [x] The root cause is recorded in the Work log.
- [x] QGC-1/OAPI-3 passes 2 runs in a row. The rest of `workloads.e2e.ts` stays green.

## Work log
- 2026-11-25 frontend-engineer: two causes, neither a product regression (YAML worker, schema and completion work).
  1) Fresh dev server: Vite's dep scan doesn't follow `?worker` imports, so `monaco-yaml/yaml.worker.js` was optimized
  when the YAML tab opened, and Vite reloaded the page mid-test (hover/completion missing). Fix: `optimizeDeps.include`.
  2) Load flake: Monaco clears "find input focused" in a 0 ms timer and Chrome runs input before timers, so `newLineAfter`'s
  Enter sometimes ran Find "next match" (caret on `status.replicas`, no new line), hence "No suggestions" (trace frames).

## Review
- Round 1 (frontend-architect, 2026-11-25): **APPROVE**. `optimizeDeps.include` targets exactly the module that
  `yaml.worker.ts` imports. monaco-yaml has no `exports` map, so the deep path resolves. The change is dev-server only and
  the comment gives the cause. In the e2e test, `closeFind` and the whole-step `toPass` retry in `newLineAfter` are sound:
  the doc says why a retry is safe (a reopened Find widget means nothing was typed). Matching on Monaco's `.find-widget`
  class is acceptable in e2e (third-party DOM, already used at L69). E2E not re-run (engineer: 8/8 and 27/27, twice).

## Handover notes
- `web/vite.config.ts`: `optimizeDeps.include: ['monaco-yaml/yaml.worker.js']` (dev only; outside the original paths,
  root cause 1). Reproduced by clearing `web/node_modules/.vite/deps` before `aspire start`; passes cold after the fix.
- `web/e2e/workloads.e2e.ts`: new `closeFind` (Escape, waits until the widget is hidden and the editor is focused) used after
  every `findInEditor`. `newLineAfter` retries as a whole if Enter reopened the Find widget, which is safe because then no
  line was typed.
- Evidence: QGC-1/OAPI-3 `--repeat-each=8` 8/8 (before: 1 of 4 and 1 of 6 failed); full `workloads.e2e.ts` 27/27 twice.
- No unit guard: both causes are dev-server/browser timing, which jsdom can't reproduce.
- Note: `web/vite.config.ts` already had Prettier drift before this change (lines 54, 70, 116); I left it alone.
- Gate: typecheck, 1551 tests and build pass. Lint fails only in other agents' uncommitted `resources/overview/*` files.
- Concurrent e2e runs by other agents share `e2e/.results` and the stack. They wipe each other's traces (ENOENT).
