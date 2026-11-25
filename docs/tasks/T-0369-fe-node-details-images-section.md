---
id: T-0369
title: Node details — Images section (OCP NodeDetailsImages)
status: todo
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0332]
paths: [web/src/features/resources/compute/nodes, web/src/mocks/k8s]
review_rounds: 0
---

## Goal
OCP's Node Details tab ends with an "Images" section (images cached on the node). Ours stops after "Capacity and
allocatable". The data is in `node.status.images`, so no Prometheus is needed. Found by the CP5b audit (T-0338).

## Scope
- In: the Images section on the Node Details tab, mock fixture images.
- Out: GPU metrics (Prometheus, Q6), the Overview/Configuration/Health tabs.

## Contract / design notes
Node details — no "Images" section (OCP h2s: Node details, Node conditions, Images; ours: Node details, Node
conditions, Capacity and allocatable) — OCP `packages/console-app/src/components/nodes/NodeDetailsImages.tsx` L14-44,
order in `NodeDetails.tsx` L13-19 — add a section after the fleet "Capacity and allocatable" one: SectionHeading
"Images", compact PF Table `gridBreakPoint=""`, columns Name | Size; rows = `status.images` entries that have `names`;
Name = the first name without `@` and without `<none>`, else `names[0]`, break-word, selectable; Size = binary bytes
humanized (OCP `humanizeBinaryBytes`, e.g. "1.25 GiB"), "-" when missing. Same table styling as Node conditions
(probe: th 12px/600, `pf-m-compact`).

## Context pack
- Touch points: `compute/nodes/NodeDetails.tsx` (Capacity table = exemplar), `compute/nodes/NodeConditionsTable.tsx`,
  a shared byte formatter if one exists (`grep -rn "GiB" web/src/shared`), node fixtures in `web/src/mocks/k8s/`.
- OCP reference: as above; live ref `/k8s/cluster/nodes/<node>/details`.

## Acceptance criteria
- [ ] Images section after Capacity and allocatable, Name/Size, digest-only names fall back like OCP (unit test).
- [ ] Mock nodes carry a few `status.images` (one digest-only) so the section shows in dev:mock.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
