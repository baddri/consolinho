---
id: T-0130
title: Bound the live events cache when watching many events
status: todo
owner: frontend-engineer
checkpoint: 6
depends_on: [T-0124]
paths: [web/src/shared/k8s, web/src/features/resources]
review_rounds: 0
---

## Goal
The events stream (T-0124) renders at most 500 events, but the live list cache behind it keeps every event the watch
delivers, with no size limit. On a busy cluster, viewing all namespaces, memory keeps growing.

## Scope
- Give the events feed a bounded source: server `limit` on the initial list, or a watch-only start, and evict old
  events from the cache beyond the cap. Keep the shared list cache unchanged for other kinds unless the design calls
  for a general limit.
- Source: T-0124 code review (frontend-architect, round 1, Q3).

## Acceptance criteria
- [ ] Memory used by the events feed stays bounded under a continuous all-namespaces event watch (test with a mock flood).
- [ ] The rendered stream is unchanged (newest 500, OCP order).

## Work log

## Review

## Handover notes
