---
id: T-0178
title: Pod log stream — streaming fetch, 1,000-line buffer, resume with sinceTime; mock log endpoint
status: todo
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0174]
paths: [web/src/shared/k8s/logStream.ts, web/src/shared/k8s/logStream.test.ts, web/src/shared/k8s/index.ts, web/src/features/resources/workloads/logs/usePodLog.ts, web/src/features/resources/workloads/logs/usePodLog.test.ts, web/src/mocks/k8s/podLogs.ts, web/src/mocks/k8s/subresources.ts, web/src/mocks/k8s/index.ts]
review_rounds: 0
---

## Goal
ADR-0037 §6, LOG-3/4/5/6/10 (data half): the log data layer the Logs tab renders — no UI here. Must work against the
proxy's lifetimes (ADR-0036 §1: followed logs are cut at ~5.5 min; EOF **or** a rejected reader = maybe reconnect).

## Scope
- In: `streamPodLog`, `podLogPath`, `usePodLog`, the mock `log` subresource + `mockK8s.appendLog/endLog/cutLog`, tests
  incl. a cut-mid-stream test (no duplicate, no lost line).
- Out: viewer/toolbar (T-0179).

## Contract / design notes
- `podLogPath(cluster, ns, pod, { container, previous?, follow?, tailLines?, sinceTime?, timestamps? })` via
  `resourceApiPath(..., { subresource: 'log', query })` — also used for Download/View raw (no `timestamps`).
- `streamPodLog(path, signal): AsyncIterable<LogLine>`, `LogLine = { ts: string; text: string }`: `k8sFetch` (errors
  → `ApiError`, e.g. 403 RBAC, 400 "container … is waiting to start"), `body.pipeThrough(new TextDecoderStream())`,
  split on `\n` keeping a partial tail, parse the RFC3339Nano prefix (`timestamps=true` always sent). Abort is silent.
- `usePodLog({ cluster, namespace, pod, container, previous, showFull, paused })` →
  `{ lines: string[]; status: 'loading' | 'streaming' | 'paused' | 'eof'; linesBehind: number; error?: ApiError; reconnect() }`.
  Buffer = last 1,000 lines (`tailLines=1000`) unless `showFull` (no `tailLines`, unbounded in memory as OCP). While
  `paused`, lines keep arriving but `linesBehind` counts them and the rendered snapshot freezes (OCP `resource-log.tsx`
  L580-600). `previous` → `previous=true`, `follow` off is **not** needed (previous logs end with EOF → `eof`).
- Reconnect (LOG-6): on EOF/rejected reader, if the pod (from `useK8sGet` — caller passes `isContainerRunning`) still
  runs the container → after 1 s reopen with `sinceTime` = last ts truncated to seconds, no `tailLines`; drop lines
  with `ts < lastTs` and the first *k* lines with `ts === lastTs` (*k* = count already shown at that ts). Else `eof`.
  Backoff 1 s → 5 s max on repeated immediate failures; give up after 5 errors → `error`.
- Changing container/previous/showFull aborts and restarts from scratch.
- Mock: `podLogs.ts` keeps per-container lines (seeded for fixture pods, with timestamps); `follow=true` streams a
  `ReadableStream` that pushes `appendLog` lines live; `cutLog` closes open streams (test the resume); `previous`
  returns a fixed earlier log or 400 "previous terminated container … not found" when `restartCount` is 0.

## Context pack
- Docs: ADR-0037 §6; ADR-0036 §1 and Consequences (cut + abort semantics).
- Exemplars: `shared/k8s/watch.ts` + `shared/k8s/ndjson.ts` (streaming fetch, line splitting, abort handling — copy the
  reader loop shape); `features/resources/events/useEventStream.ts:useEventStream` L40+ (stream as component state);
  `mocks/k8s/watch.ts` (streamed mock body).
- Touch points: `mocks/k8s/subresources.ts` (T-0174 map; add `log`), `mocks/k8s/index.ts:mockK8s`.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/utils/resource-log.tsx` L64-77 (states,
  1000 buffer), L560-640 (buffer/linesBehind/streaming), `public/components/pod-logs.tsx` L39-60 (container → source status).

## Acceptance criteria
- [ ] LOG-3: first request has `follow=true&tailLines=1000&timestamps=true`; appended lines appear (test with fake timers ≤ 2 s).
- [ ] LOG-4: buffer capped at 1,000; `paused` counts `linesBehind`; `showFull` drops `tailLines`.
- [ ] LOG-5: `previous=true` sent for Previous log.
- [ ] LOG-6: a mid-stream cut reconnects within 5 s with `sinceTime`; no duplicate, no lost line (test); container terminated → `eof`.
- [ ] LOG-10 (data): 403 surfaces `ApiError` with the cluster message; abort on unmount (no open stream after unmount — test).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
