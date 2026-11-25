---
id: T-0310
title: CP5a UX — ui-probe and OCP side-by-side of Networking/Storage pages and the two new modals
status: in_review
owner: ux-designer
checkpoint: 5a
depends_on: [T-0301, T-0302, T-0303, T-0304, T-0305, T-0306, T-0307, T-0308, T-0309]
paths: [docs/architecture/UX.md, docs/architecture/ocp-parity.md, docs/tasks/]
review_rounds: 0
---

## Goal
Every CP5a screen looks like its OCP counterpart before QA writes the parity gate (QG5A-3).

## Scope
- In:
  - Probe (`scripts/ui-probe.mjs`, 1280×800, light; dark only where tokens changed) the Routes / Ingresses /
    NetworkPolicies / PVC / PV / StorageClass lists and details, the Expand PVC and Create Project modals, and the
    Networking + Storage nav sections (order, labels).
  - Text diff (h1, column titles, tab names, details terms, empty-state copy) against OCP source, or live OCP only if
    the human provides a read-only one; record which.
  - Decide the open UX calls the FE tasks recorded: Create Project "Learn more" link omission (T-0309), Route TLS
    cert/key "Set/Not set" rendering (T-0303, SAFE5-4), Service Pods-tab empty state copy (T-0301), Expand PVC fleet
    copy (T-0308).
  - File one fix task per mismatch (next free T-number, owner frontend-engineer).
- Out: code changes beyond trivial CSS values.

## Context pack
- Tools: `scripts/ui-probe.mjs` (T-0138); mock `?mockUser=admin` and a read-only user for disabled states.
- Fixtures: `web/src/mocks/k8s/networkingStorageFixtures.ts` (T-0300) — `web`, `rejected` routes; `db-data`, `scratch`
  PVCs; `standard-csi` SC.
- OCP reference: networking-console-plugin `src/views/{routes,ingresses,networkpolicies}/` (via
  `gh api repos/openshift/networking-console-plugin/contents/<path>`); `/home/bad/works/openshift-console/frontend/public/components/{persistent-volume-claim,persistent-volume,storage-class,namespace}.tsx`,
  `public/components/modals/expand-pvc-modal.tsx`, `packages/console-shared/src/components/modals/CreateProjectModal.tsx`.

## Acceptance criteria
- [x] Probe + text-diff tables in the Work log (one line per page/modal). (Per-page lines in Handover notes.)
- [x] The four open UX calls decided and written in the Work log; UX.md updated if a rule changes.
- [x] Mismatches fixed (trivial CSS) or filed as tasks.

## Work log
- 2026-11-25 ux-designer: probe + text diff of all CP5a pages/modals, mock 1280 light vs local OCP ref (:9000, core pages) and networking-console-plugin `main` source via `gh api` (plugin not loaded in the ref console). No live OCP.
- Decisions: (1) Create Project "Learn more" link stays omitted (docs URL is vendor docs; OCP itself hides it when `isManaged()`). (2) Route TLS Certificate/Key/CA = "Set"/`-` (DASH), SAFE5-4 accepted deviation (OCP: PEM + copy + Reveal). (3) Service Pods tab selector-less = "No Pods found" sm empty state, accepted (OCP list copy). (4) Expand PVC fleet copy ("Size must be greater than the current size (<req>).", "PVC is not Bound", SC-expansion reason) accepted: sentence case, user language.
- DataView follow-up (T-0305): no task. PVC list vs OCP PVC (both ConsoleDataView isResizable): th/td padding and 80px row equal, only content widths differ. NP/Route lists were probed against OCP's *default* list (non-resizable, th padding-right 16 vs our 28 resize gutter); the real plugin uses SDK VirtualizedTable. We keep core ConsoleDataView (UX.md §5).
- Filed T-0345 (modal context/intro before Form, 16px; Name Help popover), T-0346 (shared ConsoleEmptyState for "No conditions found"), T-0347 (ResourceLink name 21px flex child). UX.md §4 (tabs per OCP kind) and §9 (paragraphs before Form) updated.
- Findings for CP5a features (trivial, not filed): F1 Events tab on Route/Ingress/NetworkPolicy/PV/StorageClass details, OCP has none (plugin `useRouteTabs`/`useIngressTabs`/`useNetworkPolicyTabs`, `persistent-volume.tsx:279`, `storage-class.tsx:216`) — `hasEventsTab: false` in the 5 kind descriptors. F2 PVC and StorageClass lists have a Created column OCP lacks (`persistent-volume-claim.tsx` L207-231, `storage-class.tsx` L122-128); spec PVC-1/SC-1 asked for it, PO call — recommend dropping it.
- 2026-11-25 frontend-engineer: F1 `hasEventsTab: false` on Route/Ingress/NetworkPolicy/PV/StorageClass; F2 Created column dropped from PVC and SC lists, spec PVC-1/SC-1 updated (orchestrator decision).
- 2026-11-25 ux-designer: F1/F2 verified on mock: Route/Ingress/NetworkPolicy/PV/StorageClass details tabs = Details|YAML (OCP `persistent-volume.tsx:279`, `storage-class.tsx:216`, plugin tab hooks); PVC list = Name|Status|PersistentVolume|Capacity|StorageClass (OCP's Used column is the known Prometheus gap), SC list = Name|Provisioner|Reclaim policy (OCP `storage-class.tsx` L122-128). APPROVE.
- 2026-11-25 frontend-architect: F1/F2 **APPROVE** — `hasEventsTab: false` on the 5 descriptors (OCP tabs confirmed in work log), `ageColumn` dropped from PVC/SC, tests and spec PVC-1/SC-1 updated; check-fe green. Nit (optional): only Route asserts the tab list; other diffs are prettier reflow.

## Review

## Handover notes
Per page (ours vs OCP; style = ui-probe mismatches beyond content widths):
- Services list/details: columns, terms match (release-4.18); +Pods/Events tabs per SVC-1; style 0.
- Routes list: Name/Status/Location/Service = plugin minus Backend health (RT-1); inline ClipboardCopy grey box = OCP `ExternalLinkWithCopy`. Details terms = plugin; +Events tab (F1); TLS Set/- (decision 2).
- Ingresses list: Name/Labels/Hosts = plugin. Details: +Ingress class/Load balancer and TLS section (ING-2 fleet additions); +Events (F1).
- NetworkPolicies list: Name/Pod selector = plugin; empty "No NetworkPolicies found" = OCP. Details: +right column (NP-2 addition); +Events (F1).
- PVC list: +Created, no Used (Prometheus, Q6) (F2); details terms = OCP + Pods/PersistentVolumes items (PVC-2); "No conditions found" bare text (T-0346).
- PV list = OCP; details +Node affinity/Source (PV-1); +Events (F1). SC list +Created (F2); details +Allow volume expansion/Parameters (SC-1); +Events (F1).
- Projects list/details unchanged from CP3 (PRJ-1). Create Project: title, Create/Cancel, small modal = OCP; gaps 40/40 vs 16 (T-0345); Name rules as helper text (T-0345).
- Expand PVC: title "Expand PersistentVolumeClaim", menu "Expand PVC", description verbatim, small = OCP; gaps 40/24 vs 16 (T-0345).
- Nav: Networking Services/Routes/Ingresses/NetworkPolicies = plugin order; Storage PV/PVC/SC = OCP minus VolumeAttributesClasses/snapshots (out of scope).
- All CP5a features: ResourceLink `<a>` 18px vs 21px (T-0347).
