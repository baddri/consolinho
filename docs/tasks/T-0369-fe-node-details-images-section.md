---
id: T-0369
title: Node details — Images section (OCP NodeDetailsImages)
status: done
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0332]
paths: [web/src/features/resources/compute/nodes, web/src/mocks/k8s]
review_rounds: 1
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
- [x] Images section after Capacity and allocatable, Name/Size, digest-only names fall back like OCP (unit test).
- [x] Mock nodes carry a few `status.images` (one digest-only) so the section shows in dev:mock.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: `NodeImagesTable` (+ `nodeImageName`, CSS module for OCP `co-select-to-copy`) as the
  last Node details section; `NODE_IMAGES` fixture on every mock node (tag, digest-only, `<none>`, unnamed); unit +
  details-page tests. Probe (ours only): th 12px/600 like Node conditions, Name cursor copy/user-select all/break-word.

## Review
- Round 1 (frontend-architect, 2026-11-25): **APPROVE**. `NodeImagesTable` mirrors OCP `NodeDetailsImages` L14-44: entries
  that have names only, tag name over digest/`<none>`, else `names[0]`, compact table with `gridBreakPoint=""`, breakWord, select-to-copy,
  index keys, "-" for a missing size. It reuses the shared `formatBinaryBytes`, is the last section, and the fixtures cover the
  tag, digest-only, `<none>` and unnamed cases. Unit and page tests are good; the targeted gate is green (nodes, 26 tests).
- Round 1 (ux-designer, 2026-11-25): **APPROVE**. Probe: mock prod-eu-1 control-plane-1 (alice) vs ref `/k8s/cluster/nodes/ip-10-0-3-203…/details`, OCP `NodeDetailsImages.tsx` L14-44. Identical: section padding 16px 23px, h2 margin-bottom 16px, `pf-m-compact` table, th Name|Size 12px/600 padding 12px 16px 8px, td 14px/400 padding 8px 16px with break-word and select-all; tag names preferred over digest names, digest-only fallback, sizes in OCP humanize style ("1.25 GiB", "744 KiB"). Placed after the fleet "Capacity and allocatable" section as specified.

## Handover notes
- Size uses the shared `formatBinaryBytes` (OCP `humanizeBinaryBytes`); "-" only when `sizeBytes` is missing.
- No empty state, as in OCP: a node without images shows just the table header.
- The probe ran on our side only: I had no live node name for the OCP route (no `oc` without the human asking).
- `check-fe.sh src/features/resources/compute/nodes`: lint, typecheck and tests green (26/26).
