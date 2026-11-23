---
id: T-0217
title: Node column on DaemonSet and Job Pods tabs (OCP showNodes)
status: todo
owner: frontend-engineer
checkpoint: CP4c
depends_on: [T-0213, T-0214]
paths: [web/src/features/resources/details/ResourcePodsTab.tsx, web/src/features/resources/details/ResourcePodsTab.test.tsx, web/src/features/resources/registry/types.ts, web/src/features/resources/registry/kinds/pods.tsx, web/src/features/resources/registry/kinds/pods.test.tsx, web/src/features/resources/registry/kinds/daemonsets.tsx, web/src/features/resources/registry/kinds/jobs.tsx, docs/architecture/ocp-parity.md]
review_rounds: 0
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
- [ ] DaemonSet and Job Pods tabs show Node instead of Owner; Deployment/StatefulSet/RS/RC/DC Pods tabs are unchanged (tests).
- [ ] The parity rows are updated.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
