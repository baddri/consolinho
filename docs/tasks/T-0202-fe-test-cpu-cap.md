---
id: T-0202
title: Cap Vitest CPU use and make npm test a one-shot run
status: done
owner: orchestrator
checkpoint: 4
depends_on: []
paths: [web/vite.config.ts, web/package.json]
review_rounds: 0
---

## Goal
Human report: frontend tests take ~100% CPU and seem to keep running. Measured: the suite exits cleanly (no hanging
logs/exec tests; neither is a slow outlier), but Vitest spawns one worker per core and each V8 adds helper threads
(~930% CPU on 10 cores, 78 s). `"test": "vitest"` also stays in watch mode in an interactive terminal.

## Acceptance criteria
- [x] `maxWorkers: '40%'` + `execArgv: ['--v8-pool-size=1']`: ~500% CPU, same wall time (~80 s), 1064/1064 pass.
- [x] `npm test` = `vitest run`; watch mode moved to `npm run test:watch`. `npm test -- --run` still works.

## Work log
- 2026-11-23 orchestrator: measured 10/5/3 workers ± v8 pool; chose 4 workers + pool 1. check-fe.sh green.
  Follow-up idea (not done): `isolate: false` would save ~16 s but risks cross-file mock/global leakage.
