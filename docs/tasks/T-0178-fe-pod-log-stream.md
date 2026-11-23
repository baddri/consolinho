---
id: T-0178
title: Pod log stream — streaming fetch, 1,000-line buffer, resume with sinceTime; mock log endpoint
status: done
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0174]
paths: [web/src/shared/k8s/logStream.ts, web/src/shared/k8s/logStream.test.ts, web/src/shared/k8s/index.ts, web/src/features/resources/workloads/logs/usePodLog.ts, web/src/features/resources/workloads/logs/usePodLog.test.ts, web/src/mocks/k8s/podLogs.ts, web/src/mocks/k8s/subresources.ts, web/src/mocks/k8s/index.ts]
review_rounds: 1
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
- [x] LOG-3: first request has `follow=true&tailLines=1000&timestamps=true`; appended lines appear (test with fake timers ≤ 2 s).
- [x] LOG-4: buffer capped at 1,000; `paused` counts `linesBehind`; `showFull` drops `tailLines`.
- [x] LOG-5: `previous=true` sent for Previous log.
- [x] LOG-6: a mid-stream cut reconnects within 5 s with `sinceTime`; no duplicate, no lost line (test); container terminated → `eof`.
- [x] LOG-10 (data): 403 surfaces `ApiError` with the cluster message; abort on unmount (no open stream after unmount — test).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: started; log stream + usePodLog + mock `log` subresource.
- 2026-11-23 frontend-engineer: done; gate green (81 files / 926 tests). No UI, so no style probe run → in_review.
- 2026-11-23 frontend-engineer: round-1 fixes (F1 give-up always `ApiError` + backoff test; explicit throw; trim per flush) → in_review.

## Review
- 2026-11-23 frontend-architect, round 1: **CHANGES_REQUESTED** (gate green, 81 files / 926 tests). Streaming (only the
  partial tail is held), abort on unmount (`reader.cancel` in `finally` + `openLogStreams` test) and the `sinceTime`
  dedupe (`logTimeKey` order, skip `< lastKey` + first *k* at `lastKey`, fresh filter per attempt) are correct.
  Engineer questions: (1) `onOpen` OK (OCP `onopen` → `STREAM_ACTIVE`); (2) 4xx stops at once OK, retrying
  won't fix 403/400/404 and `reconnect()` exists; (3) store-listener reset OK, keeps `db.ts`/`store.ts` untouched; (4) see F1.
- F1 `web/src/features/resources/workloads/logs/usePodLog.ts:176-178` — giving up after `MAX_FAILURES` calls
  `sink.end(failure)`, so 5 immediate clean EOFs while the container runs end as plain `eof` ("Log stream ended.")
  with no error. The spec says "give up after 5 errors → `error`", and OCP keeps "ended" for a real close and shows its
  error alert + Retry for a failure. Fix: always end with an `ApiError` there (`failure ??` a synthesized status-0
  error, e.g. "The log stream kept closing."). Add a fake-timer test of the backoff + give-up (≈1+2+4+5 s, then `error`).
- Nit (optional) `web/src/shared/k8s/logStream.ts:131` — `return apiErrorFromRejection(error)` relies on `never` to
  throw; write it as a bare call (or `throw`) so it doesn't read like a returned value.
- Nit (optional) `usePodLog.ts:251` — `splice` per line is O(n) per line on a noisy log; trim once in `publish`.
- 2026-11-23 frontend-architect, round 2: **APPROVE**. F1 fixed (`usePodLog.ts:176-185`, `failure ??` synthesized
  status-0 `ApiError`), and the backoff test checks 1/2/4/5 s gaps and ends with `error` after 5 attempts. Both nits
  done (`logStream.ts:127` explicit `throw`, trim in `publish`). The 2 test files pass (15 tests).
  Optional: the test fails every attempt with `HttpResponse.error()`, so the synthesized-error branch (clean immediate EOFs) has no test.

## Handover notes
- `shared/k8s/logStream.ts`: `podLogPath`, `streamPodLog(path, signal, onOpen?)` (extra optional `onOpen` so a quiet
  log leaves `loading`), plus `parseLogLine`, `logTimeKey` (sortable key: kubelet trims fraction zeros, so ts strings
  don't sort as text), `logTimeToSecond`. Blank log lines are kept; a final line without `\n` is emitted on clean EOF.
- `usePodLog` takes `isContainerRunning` (read via ref after the 1 s delay, never restarts the stream). Only status 0
  and 5xx are retried; any 4xx ends at once with `error` (status `eof`). "Immediate failure" = no new line and < 5 s
  open; 5 in a row → `eof` + `error` (last failure, or a synthetic status-0 one). `reconnect()` restarts from scratch.
- Pause: frozen snapshot is set during render (OCP pattern); EOF unfreezes. Lines flush every 50 ms.
- Mock `podLogs.ts` (`log` in `SUBRESOURCES`): seeded 10 lines per container; `mockK8s.appendLog/endLog/cutLog` and
  `openLogStreams` (unmount assertions). `mockK8s` is now merged in `mocks/k8s/index.ts` (store.ts untouched). Log state
  resets via a store listener's `close` (called by `resetK8sStore`), so `db.ts` is untouched.
- Mock 400s: no `container` on multi-container pod, unknown container, waiting (ContainerCreating/ImagePull*), previous
  with `restartCount` 0. CrashLoopBackOff serves its log without following.
