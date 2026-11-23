---
id: T-0217
title: Node column on DaemonSet and Job Pods tabs (OCP showNodes)
status: done
owner: frontend-engineer
checkpoint: CP4c
depends_on: [T-0213, T-0214]
paths: [web/src/features/resources/details/ResourcePodsTab.tsx, web/src/features/resources/details/ResourcePodsTab.test.tsx, web/src/features/resources/registry/types.ts, web/src/features/resources/registry/kinds/pods.tsx, web/src/features/resources/registry/kinds/pods.test.tsx, web/src/features/resources/registry/kinds/daemonsets.tsx, web/src/features/resources/registry/kinds/jobs.tsx, docs/architecture/ocp-parity.md]
review_rounds: 1
---

## Goal
CP4b accepted a deviation: workload Pods tabs show Owner where OCP shows Node (§4b.8 follow-up). Mirror OCP exactly. Only the DaemonSet and Job Pods tabs swap the Owner column for Node, because there the owner is the page itself and the node is the triage information.

## Scope
- In: a descriptor flag; a Node column variant of the pod columns; the parity row note.
- Out: other workload Pods tabs. They keep Owner, as in OCP (`usePodsColumns(showNodes=false)`).

## Contract / design notes
- `ResourceDescriptor.podsShowNodes?: true` (TSDoc: OCP `showNodes`), set on daemonsets and jobs.
- `SelectorPodsTab` passes the flag. The pod descriptor's columns become `podColumns({ showNodes })`, or an equivalent variant hook.
  - Node cell links to the node like OCP's `NodeLink`: a plain text name if we have no Node page (check `registry/kinds` for a nodes descriptor first).
  - Same breakpoint as Owner.

## Context pack
- Touch points:
  - `web/src/features/resources/details/ResourcePodsTab.tsx:SelectorPodsTab` (L23 `fixedSelector`).
  - `web/src/features/resources/registry/kinds/pods.tsx` (Owner column ~L85).
  - `web/src/features/resources/registry/types.ts:ResourceDescriptor` (`podsSelector` L125).
- OCP reference (`/home/bad/works/openshift-console/frontend/`):
  - `public/components/pod-list.tsx` L103-144 (`usePodsColumns(showNodes)`).
  - `public/components/daemon-set.tsx:129`.
  - `public/components/job.tsx:194`.
- Parity: the CP4b rows for DaemonSet/Job Pods tabs in `docs/architecture/ocp-parity.md` (remove the deviation note).

## Acceptance criteria
- [x] DaemonSet and Job Pods tabs show Node instead of Owner; Deployment/StatefulSet/RS/RC/DC Pods tabs are unchanged (tests).
- [x] The parity rows are updated.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: in_progress → in_review. `podColumns({ showNodes })` + `podNodesDescriptor` in pods.tsx; `podsShowNodes` flag on DaemonSet/Job; `SelectorPodsTab` picks the descriptor. New ResourcePodsTab.test.tsx (DS/Job Node; Deploy/STS/RS/RC/DC Owner). Scoped check-fe green; full gate red only from concurrent deployments/form WIP (ImagesSection, deploymentFormValues, EditDeploymentPage.test). Probe: Node th visible at 1280, nowrap, 136px, same slot as Owner.

## Review
- 2026-11-24 frontend-architect (round 1, code + UX): **APPROVE**. Matches OCP `usePodsColumns(showNodes)` (pod-list.tsx L142-144): header Node in Owner's slot, sort `spec.nodeName`, same breakpoints; DS/Job flags mirror daemon-set.tsx/job.tsx. Node cell is plain badged text since no Node page exists (OCP `ResourceLink kind="Node"`), consistent with Pod details. Scoped vitest (5 files/50 tests), eslint, tsc green.
- Nit (optional): OCP keeps column id `owner` for the swapped slot; ours is `node` — harmless (no column management persisted), only matters if column-management prefs are added later.
- Follow-up: link the Node cell once a nodes descriptor lands; full `check-fe.sh` to be re-run when deployments/form WIP lands.

## Handover notes
- `ResourceDescriptor.podsShowNodes?: true` (types.ts); set in daemonsets.tsx and jobs.tsx.
- pods.tsx: `podColumns({ showNodes })` mirrors OCP `usePodsColumns`; `podNodesDescriptor` is a module constant (stable identity for ResourceDataView memos). Node column id `node`, same breakpoints as Owner, sorts by `spec.nodeName`.
- No Node page exists, so the cell is `BadgedName` (N badge, plain text) like Pod details' Node row; link it once a nodes descriptor lands.
- Parity rows for DaemonSet/Job updated (there was no explicit deviation text in them to remove).
- Full `check-fe.sh` failed only on the other engineer's deployments/form WIP; rerun the gate once that lands.
