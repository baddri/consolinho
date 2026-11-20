---
id: T-0096
title: Require typing the resource name to delete on production clusters
status: todo
owner: frontend-engineer
checkpoint: 4
depends_on: []
paths: [web/src/features/resources/]
review_rounds: 0
---

## Goal
CP2 delete (UI-8) asks for typed confirmation only for Projects/Namespaces. On a `production` cluster a single click
deletes any object; CP4 adds more destructive actions (pod delete is the daily one, plus rollout restart). Wrong-cluster
mistakes are the top fear when hopping between 40 clusters. Found in CP2 PO acceptance.

## Scope
- In: `DeleteResourceModal` asks for the object name when the active cluster's environment is `production` (any kind);
  modal text keeps naming cluster + environment. Reuse the existing typed-confirm prop of the shared modal.
- Out: bulk delete, change-window policy (backlog), confirmations for non-delete actions (decide in CP4 spec).

## Acceptance criteria
- [ ] Given a production cluster, when I delete a ConfigMap, Delete stays disabled until the exact name is typed.
- [ ] Staging/development deletes are unchanged (one click after the modal).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
