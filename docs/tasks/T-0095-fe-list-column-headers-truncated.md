---
id: T-0095
title: Resource list column headers must stay readable at common widths
status: todo
owner: frontend-engineer
checkpoint: 4
depends_on: []
paths: [web/src/features/resources/]
review_rounds: 0
superseded_by: T-0121
---

## Goal
At 1440 px the Pods list (all projects) shows headers as "N…", "R…", "R…", "Cr…" (Namespace, Ready, Restarts,
Created) while the Name/Owner columns take the space. Operators scan these columns first. Found in CP2 PO acceptance.

## Scope
- In: column width hints in the kind descriptors / `ResourceTable` (PF `Th` `modifier="fitContent"`/`wrap` or `width`),
  so short-value columns never truncate their header at >= 1280 px; header tooltip when truncation is unavoidable.
- Out: column management (show/hide), resizable columns.

## Acceptance criteria
- [ ] Pods (all projects), Deployments and Services lists at 1280 and 1440 px show every header in full (MSW test or e2e screenshot check).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
