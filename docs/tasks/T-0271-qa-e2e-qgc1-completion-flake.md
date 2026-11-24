---
id: T-0271
title: "bug (test): e2e QGC-1/OAPI-3 completion step flakes with \"No suggestions\""
status: todo
owner: qa-engineer
checkpoint: 4.5a
depends_on: []
paths: [web/e2e/workloads.e2e.ts]
review_rounds: 0
---

## Goal
Make `workloads.e2e.ts` `QGC-1/OAPI-3` deterministic. The test failed in 3 of 4 full e2e runs during T-0266 and in 1 of 3
runs with `--repeat-each=3`. It always passes in isolated reruns.

## Repro
`aspire start --launch-profile http && aspire wait web`, then `cd web && npx playwright test e2e/workloads.e2e.ts -g "QGC-1/OAPI-3" --repeat-each=3`.

## Expected vs actual
- Expected: after `newLineAfter(page, 'replicas: 1')`, Ctrl+Space lists `minReadySeconds` and `progressDeadlineSeconds`.
- Actual: `.suggest-widget` shows "No suggestions.". The hover step just before it passes, so the schema is attached.
  Retrying Ctrl+Space for 15 s did not help, so this is not a worker-sync race.

## Suspected location
`findInEditor`/`newLineAfter` in `web/e2e/workloads.e2e.ts`. Monaco Find is case-insensitive, so `replicas: 1` also
matches `readyReplicas: 1`/`availableReplicas: 1`/`updatedReplicas: 1` under `status`. The find widget is reused
between calls. Either one can put the caret on a line outside `spec`, where no spec children are suggested.
Fix idea: search `\n  replicas: 1` with regex/match-case, or assert the caret line before Ctrl+Space. If the caret is
proven to be in `spec`, re-classify this as a product bug (monaco-yaml completion, T-0239 area).

## Acceptance criteria
- [ ] QGC-1/OAPI-3 passes 5/5 with `--repeat-each=5` and in two consecutive full e2e runs.

## Work log

## Review

## Handover notes
