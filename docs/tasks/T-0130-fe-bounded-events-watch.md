---
id: T-0130
title: Bounded live list caches — cap the events watch at the newest 500
status: todo
owner: frontend-engineer
checkpoint: 6b
depends_on: []
paths: [web/src/shared/k8s/hooks.ts, web/src/shared/k8s/watchManager.ts, web/src/shared/k8s/queryKeys.ts, web/src/shared/k8s/hooks.test.tsx, web/src/features/resources/events, docs/architecture/FRONTEND.md]
review_rounds: 0
---

## Goal
The events stream (T-0124) renders at most 500 events, but the list cache behind it keeps every event the watch
delivers. On a busy all-namespaces watch, memory keeps growing. Covers spec CP6 **BW-1, BW-2** (size **M**).

## Scope
- In: an opt-in bound on `useK8sList` applied to both the initial pages and watch batches; events use it.
- Out: server `limit` changes, virtualisation, other kinds (mechanism only, documented).

## Contract / design notes
- `shared/k8s`: `export interface ListBound<T> { max: number; rank: (item: T) => number }` — keep the `max` items with
  the highest `rank` (newest wins). `useK8sList(cluster, model, opts: ListOptions & { enabled?; bound?: ListBound<T> })`.
- The bound is part of the cache identity: `k8sQueryKeys.list` appends `{ max }` only when a bound is set, so a bounded
  and an unbounded consumer of the same list never share a cache (existing keys unchanged).
- Apply in one pure helper `applyBound(items, bound)` used by `reduceListChunk` (hooks.ts L58-63) and after
  `applyListEvents` in `WatchManager` (watchManager.ts L279) — `WatchTarget.bound?: ListBound<WatchedObject>`.
  Keep rank stable for a given `rank` reference (callers pass a module constant).
- Events: `features/resources/events/eventStream.ts` exports `EVENT_BOUND = { max: MAX_EVENTS, rank: eventTime }`
  (same timestamp `sortEvents` uses); `useEventStream` passes it. `latestEvents` stays (sort + slice is harmless).
- FRONTEND.md § Data fetching rules: one bullet "bounded lists (`bound`)", BW-2.

## Context pack
- Touch points: `web/src/shared/k8s/hooks.ts:useK8sList` (L75-117), `reduceListChunk` (L58-63);
  `web/src/shared/k8s/watchManager.ts:WatchTarget` (L45-53), `applyListEvents` (L85-100), call site L279;
  `web/src/shared/k8s/queryKeys.ts:k8sQueryKeys.list` (L26-); `web/src/features/resources/events/useEventStream.ts:useEventStream`
  (L40-41); `eventStream.ts:MAX_EVENTS` (L7), `latestEvents` (L99).
- Tests: `web/src/shared/k8s/hooks.test.tsx` (watch flood via `mockK8s.*` helpers, `setWatchTimingForTests`).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/events.tsx` (`maxMessages = 500` L55, slice L397).

## Acceptance criteria
- [ ] BW-1: 10 000 watched ADDED events → cached `items.length` ≤ 500 at every flush and the newest 500 kept (test).
- [ ] BW-1: an initial list of 2 000 events (8 pages) caches ≤ 500 (test).
- [ ] BW-2: Events page/tab render unchanged (existing tests pass); unbounded lists' query keys unchanged (test).
- [ ] FRONTEND.md bullet; TSDoc. Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-26 frontend-architect: designed for CP6b (BW-1/2); source T-0124 review Q3.

## Review

## Handover notes
