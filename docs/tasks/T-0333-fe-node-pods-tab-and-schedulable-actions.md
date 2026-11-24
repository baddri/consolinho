---
id: T-0333
title: Node Pods tab (the drain view) and Mark as unschedulable / schedulable
status: todo
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0332]
paths: [web/src/features/resources/compute/nodes, web/src/features/resources/registry/kinds/nodes.tsx]
review_rounds: 0
---

## Goal
Lane C step 2: NODE-4/NODE-5. The Pods tab lists every pod on the node with its owner (the drain view, Q2: no drain
action) and the kind actions cordon/uncordon the node.

## Scope
- In: `PodsTab` component for Node, `useNodeActions` (kind actions), confirm modal, toast.
- Out: Drain/Evict (Q2). The fleet additions above are recorded by UX in ocp-parity.

## Contract / design notes
- **Pods tab** (NODE-4): descriptor `PodsTab` (nodes select by field, not label). One list, all namespaces,
  `fieldSelector=spec.nodeName=<name>`, watched like other pod lists. Columns Name, Namespace, Status, Ready, Owner
  (`ObjectReferenceLink` of the controller ownerReference), Created. Toolbar filter "Exclude DaemonSet pods"
  *(fleet)*; count line "`<N>` pods (`<M>` not managed by a DaemonSet)" *(fleet)*. Bare pods: warning icon + tooltip
  "Not managed by a controller — deleted on drain" *(fleet)*. Reuse `details/ResourcePodsTab.tsx` rendering only if
  it takes list options without an engine change; otherwise build the tab in `compute/nodes/` on `ConsoleDataView`
  (no engine edits in this lane). No eviction/drain (Q2).
- **Actions** `useNodeActions` (OCP `nodeSchedulingActions.ts`): `Mark as unschedulable` when not unschedulable →
  confirm modal (`ResourceMutationModal`, copy from OCP `ConfigureUnschedulableModal`: title "Mark as unschedulable?",
  body copy from that file verbatim, primary "Mark unschedulable", cluster named via `ClusterContextText`, SAFE5-1) → JSON Patch
  `[{op:'add'|'replace', path:'/spec/unschedulable', value:true}]` (ADR-0037 §4; `add` works on absent keys).
  `Mark as schedulable` when unschedulable → no modal (OCP), JSON Patch `[{op:'remove', path:'/spec/unschedulable'}]`
  via `useResourceMutation`, success toast naming node + cluster. Exactly one of the two items is shown. Both gated by `useResourceAccess` `patch` on nodes; disabled with reason
  for RO grants / read-only users (SAFE5). Errors (403 `Proxy.ReadOnlyGrant`) shown by the shared mutation path.
- Order in the kebab: kind actions first, then common (Edit labels, Edit annotations, Edit Node, Delete Node).

## Context pack
- Docs: spec §5b.1 NODE-4, NODE-5; ADR-0037 §4 (JSON Patch); SECURITY.md SAFE5 lines via the spec.
- Exemplars: `workloads/scale/useEditCountAction.tsx` (modal action), `registry/kinds/deployments.tsx:useDeploymentActions`
  (modal-less patch + toast); `details/ResourcePodsTab.tsx`.
- Touch points: `registry/types.ts` `PodsTab` / `useKindActions`; `actions/ResourceMutationModal.tsx`.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/src/components/nodes/menu-actions.tsx:useNodeActions`,
  `nodeSchedulingActions.ts`, `modals/ConfigureUnschedulableModal.tsx`; node pods tab in `NodeDetailsPage.tsx`.

## Acceptance criteria
- [ ] NODE-4: Pods tab lists pods of all namespaces on the node (MSW asserts the fieldSelector), owner column, DaemonSet filter + count line, bare pod flagged.
- [ ] NODE-5: Mark as unschedulable (modal) / schedulable (no modal) send the JSON Patch (MSW body assertion); status flips to "Scheduling disabled" via the watch.
- [ ] Actions disabled with reason for a read-only grant; the 403 path renders the error.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
