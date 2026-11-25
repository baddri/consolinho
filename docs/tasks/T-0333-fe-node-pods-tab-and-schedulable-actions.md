---
id: T-0333
title: Node Pods tab (the drain view) and Mark as unschedulable / schedulable
status: done
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0332]
paths: [web/src/features/resources/compute/nodes, web/src/features/resources/registry/kinds/nodes.tsx]
review_rounds: 1
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
- [x] NODE-4: Pods tab lists pods of all namespaces on the node (MSW asserts the fieldSelector), owner column, DaemonSet filter + count line, bare pod flagged.
- [x] NODE-5: Mark as unschedulable (modal) / schedulable (no modal) send the JSON Patch (MSW body assertion); status flips to "Scheduling disabled" via the watch.
- [x] Actions disabled with reason for a read-only grant; the 403 path renders the error.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: started; Pods tab on ConsoleDataView in compute/nodes (useResourceDataView takes no fieldSelector), useNodeActions + modal.
- 2026-11-25 frontend-engineer: done. Probe ours dev-1 worker-2/pods vs OCP `/k8s/all-namespaces/core~v1~Pod` (same
  `PodsPage`): 11/71 mismatches, all widths/heights from data (OCP row 164px from long owner lists); type, padding,
  borders, toolbar 0 diffs. Modal not probed (probe never clicks); copy/variant per OCP `ConfigureUnschedulableModal`.
- 2026-11-25 frontend-engineer: fix round 1. Owner `['hidden','visibleOnLg']` (shown at 1280: 132px vs OCP 126px), bare-pod
  PopoverStatus (link button, header "No owner"), union `hasKey`, useMemo view. At 1280 table 1085px in an 894px
  `overflow-x:auto` wrapper (nowrap names, as in OCP, which is 1848px there); it scrolls even without Owner (953px).

## Review
- 2026-11-25 frontend-architect, round 1: **APPROVE**. Gate run with 2 concurrent gates: lint/build ok, 8 failures all
  outside T-0333 paths (timeouts + other in-progress tasks); `vitest run compute/nodes` 24/24 green, eslint on paths clean.
- (a) Pods tab in `compute/nodes` on `ConsoleDataView`: accepted (contract allowed it, no engine edits this lane). Duplicated
  filter wiring (`NodePodsTab.tsx` filterValues/onFilterChange/filterNodes) moves to the engine in follow-up T-0364.
- (b) Departures accepted: title without "?" and Restarts column match OCP (`ConfigureUnschedulableModal`, `PodsPage`).
- (c) Patch correct: `add` when `spec.unschedulable` absent, `replace` when present (= OCP `makeNodeUnschedulable` `_.has`);
  `remove` only offered while `unschedulable === true`, so the key exists. OCP uncordons with `replace false`; `remove`
  is the contract (ADR-0037 §4) and matches `oc adm uncordon`'s resulting object, kept.
- Nit (optional) `useNodeScheduling.ts:5-9` — `hasKey` is meaningless for the remove case (`useNodeActions.tsx:28` passes
  `hasKey: true` as filler); a discriminated union `{unschedulable:true; hasKey} | {unschedulable:false}` would say so.
- Nit (optional) `NodePodsTab.tsx:36-42` — bare-pod tooltip is hover-only; for keyboard users consider PF `Tooltip` on a
  focusable `Icon`/plain `Button` or visible helper text. Leave to UX review.
- Nit (optional) `NodePodsTab.tsx:62` — module-level `let view` cache; a `useMemo(buildNodePodsView, [])` would be
  equally lazy without module state (fine as is; T-0364 may remove most of it).
- 2026-11-25 ux-designer round 1: **CHANGES_REQUESTED** (mock dev-1 worker-1/worker-2 as admin at 1280 and 1920; OCP `console-app/src/components/nodes/NodeWorkload.tsx` → `public/components/pod-list.tsx`, `nodes/modals/ConfigureUnschedulableModal.tsx`, `nodes/menu-actions.tsx`).
  1. Pods tab, 1280: the Owner column is hidden below 2xl (`nodePodsView` applies `allNamespacesVisibility` `visibleOn2Xl` to Owner), so at 1280 the drain view hides its key column and the bare-pod warning (headers are Name|Namespace|Status|Ready|Restarts only). OCP `pod-list.tsx` Owner has no breakpoint — fix: on this tab Owner keeps `['hidden','visibleOnLg']`; check at 1280 that the table does not scroll horizontally (Created stays 2xl).
  2. Bare-pod tooltip: hover-only is not acceptable (keyboard and screen-reader users never get the explanation; PF tooltip guidance needs a focusable trigger). Use OCP's `PopoverStatus` pattern (`console-dynamic-plugin-sdk/src/app/components/status/PopoverStatus.tsx`: PF `Popover` position right, header = status title, trigger `Button variant="link" isInline` wrapping the icon+text), as our `workloads/pods/PodStatusPopover.tsx` already does: trigger "No owner" with the warning icon, header "No owner", body "This pod is not managed by a controller. Draining the node deletes it and nothing recreates it." A button satisfies the lint rule.
  3. OK: modal matches `ConfigureUnschedulableModal` (small, 560px; title "Mark as unschedulable" without "?"; body verbatim; primary "Mark unschedulable" + link Cancel; one close control; cluster context line). Kebab shows exactly one of Mark as schedulable/unschedulable, first, then common actions (`menu-actions.tsx`); success toast names node and cluster; status flips to "Scheduling disabled".
  4. OK: count line "4 pods (2 not managed by a DaemonSet)" and the Owner filter category (fleet, recorded); modal and table type/padding per the engineer's probe (0 diffs).
- 2026-11-25 ux-designer round 2: **APPROVE** (mock dev-1 worker-2 at 1280, Playwright text checks; OCP `pod-list.tsx`, `PopoverStatus.tsx`).
  1. Fixed: Owner shown at 1280 (headers Name|Namespace|Status|Ready|Restarts|Owner), 132px vs OCP 126px.
  2. Fixed: "No owner" is a `pf-m-link pf-m-inline` button (keyboard Enter opens it) with a PF Popover, header "No owner" and the agreed body; Escape closes it. It opens on top here because PF flips it when there is no room on the right, which is expected.
  3. Accepted: about 190px of horizontal scroll at 1280 (table 1085px in an 894px wrapper) comes from the shared table, and OCP's pod list also scrolls at 1280.

## Handover notes
- Files: `compute/nodes/{NodePodsTab.tsx,useNodeActions.tsx,MarkUnschedulableModal.tsx,useNodeScheduling.ts,nodePods.test.tsx}`,
  `registry/kinds/nodes.tsx` (`PodsTab`, `useKindActions`). No engine, routes or mock edits (fixtures already had DS/RS/bare pods).
- Pods tab is built on `ConsoleDataView` + `useK8sList({ fieldSelector })`: `useResourceDataView` takes no field
  selector. Follow-up candidate: add `fieldSelector` to `useResourceDataView` and drop the duplicated filter wiring.
- Its descriptor/columns are built lazily (`nodePodsView()`), not at import: the registry→nodes→pods import cycle
  otherwise hits `podColumns` before `columns.tsx` initialises (registry.test failed).
- Deviations from the contract, OCP wins: modal title "Mark as unschedulable" (OCP has no "?"); Restarts column kept
  (OCP `PodsPage`). Unschedulable patch uses `replace` when the key exists, else `add` (OCP `makeNodeUnschedulable`).
- Owner filter "Exclude DaemonSet pods" is a checkbox filter category `?owner=exclude-daemonset` (no engine toolbar slot).
- Bare pods: PopoverStatus pattern (`Button variant="link" isInline` + PF Popover right, header "No owner").
- At 1280 the table scrolls horizontally (~190px) in the 894px column; it's driven by data and the engine (nowrap names), not by Owner, and OCP scrolls too.
