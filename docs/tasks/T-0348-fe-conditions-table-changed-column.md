---
id: T-0348
title: ConditionsTable optional heartbeat "Updated" + "Changed" columns for Node conditions (OCP parity)
status: cancelled
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0332]
paths: [web/src/features/resources/components/ConditionsTable.tsx, web/src/features/resources/compute/nodes]
review_rounds: 0
---

## Goal
OCP's Node conditions table (`NodeDetailsConditions.tsx`) shows Type, Status, Reason, Updated (`lastHeartbeatTime`),
Changed (`lastTransitionTime`). Our shared `ConditionsTable` has Type, Status, Updated (transition), Reason, Message.
Close the parity gap found in the T-0332 review without forking the table.

## Scope
- In: an opt-in prop on `ConditionsTable` (e.g. `variant="node"` or `heartbeat`) rendering Updated = heartbeat and
  Changed = transition; use it in `compute/nodes/NodeDetails.tsx:NodeSections`. Keep Message (spec NODE-3 asks for it).
- Out: changing the default columns for other kinds.

## Contract / design notes
Default rendering of every existing caller must stay byte-identical. Heading copy: keep "Conditions" unless the spec changes.

## Context pack
- Touch points: `components/ConditionsTable.tsx`, `compute/nodes/NodeDetails.tsx:NodeSections`, `compute/nodes/nodes.test.tsx`.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/src/components/nodes/NodeDetailsConditions.tsx`.

## Acceptance criteria
- [ ] Node details Conditions show Updated (heartbeat) and Changed (transition) columns; other kinds unchanged.
- [ ] Test covers both columns on a node.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

- 2026-11-25: cancelled; superseded by the node-local `NodeConditionsTable` in T-0332 fix round 1 (shared ConditionsTable unchanged).

## Review

## Handover notes
