---
id: T-0131
title: Fit the ReplicaSets and Services lists at 1280
status: todo
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0126]
paths: [web/src/features/resources/registry]
review_rounds: 0
---

## Goal
At 1280 the ReplicaSets (982/894 px, Labels column) and Services (906/894 px) tables are wider than the page, so the
last columns scroll behind the sticky kebab. This predates T-0126. Pods, Deployments and the admin lists fit.

## Scope
- Per-column starting widths / `modifier: 'wrap'|'truncate'` via `DataViewColumn` (as T-0126 did for Pods), matching
  how OCP's ReplicaSets and Services lists lay out at 1280. No shared `ConsoleDataView` changes unless the architect agrees.

## Acceptance criteria
- [ ] ReplicaSets and Services fit at 1280 and 1920 (light), width stable from loading to loaded to a no-match filter.
- [ ] Side-by-side with the reference console at 1280.

## Work log

## Review

## Handover notes
