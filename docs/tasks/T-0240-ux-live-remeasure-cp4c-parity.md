---
id: T-0240
title: Live re-measure of CP4c parity fixes against the OCP console (T-0214, T-0235–T-0237)
status: todo
owner: ux-designer
checkpoint: backlog     # next live UX pass (CP4.5 or CP5 kickoff)
depends_on: []
paths: [docs/architecture/ocp-parity.md, docs/tasks/T-0240-ux-live-remeasure-cp4c-parity.md]
review_rounds: 0
---

## Goal
The CP4c fixes T-0235 (h2 20px), T-0236 (Labels "Edit" / annotations link), T-0237 (popover links) and the T-0214 Edit
Deployment form were checked against OCP source only, because the OCP reference console was down. Measure them
side by side with a live OCP bridge so that parity rows 38/46 rest on measurements and not only on code reading.

## Scope
- In: style probe (`scripts/ui-probe.mjs`) on Deployment details (dt row height 21px, term "Edit" link 14px/400,
  field-help popover min-width vs OCP 332px) and the Edit Deployment form, in light and dark. Update parity rows 38/46.
- Out: fixing deltas. File each delta as its own task.

## Acceptance criteria
- [ ] Probe numbers ours vs OCP recorded in the Work log for every item above, in both themes.
- [ ] Parity rows 38/46: the "Not re-measured" notes are removed or replaced by measured deltas, each linked to a filed task.

## Work log

## Review

## Handover notes
