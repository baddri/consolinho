---
id: T-0338
title: CP5b UX audit — probe and side-by-side vs OCP for Compute, Cluster Settings, Overview, Installed Operators
status: todo
owner: ux-designer
checkpoint: 5b
depends_on: [T-0332, T-0333, T-0334, T-0335, T-0336, T-0337]
paths: [docs/architecture/UX.md, docs/architecture/ocp-parity.md, docs/tasks/]
review_rounds: 0
---

## Goal
QG5B-3 visual half: compare every CP5b screen with its OCP counterpart (style probe first, screenshots only where
text can't settle) and record parity rows; file bug tasks for mismatches.

## Scope
- In: Nodes list/details + Pods tab, Mark as unschedulable modal, MachineSets/Machines, Cluster Settings (both tabs),
  ClusterOperator details, Overview dashboard (grid, card spacing, health items, inventory, activity), Installed
  Operators list/details, Subscription tab; light theme, dark only where colours/tokens are new (status icons, cards).
- Out: fixing code (file `T-03xx` bug tasks, frontend-engineer).

## Context pack
- Docs: UX.md §5 (list rules, read-only kinds), ocp-parity.md format; spec §5b.7 deviations/gaps list (record as accepted gaps).
- Tool: `scripts/ui-probe.mjs` (T-0138).
- OCP reference: the paths in T-0332…T-0337 Context packs.

## Acceptance criteria
- [ ] One ocp-parity row per QG5B-3 item: `match`, or `gap` with the spec decision (Q2/Q6/Q7/Q9), or a bug task id.
- [ ] Fleet additions (Capacity and allocatable, drain hints, Kubernetes overview rows) checked for OCP style.
- [ ] UX.md updated only if a new rule emerged (e.g. dashboard card rules).

## Work log

## Review

## Handover notes
