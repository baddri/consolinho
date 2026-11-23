---
id: T-0176
title: Kind actions, mutation feedback and the cluster-naming mutation modal shell
status: todo
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0173, T-0174, T-0175]
paths: [web/src/features/resources/actions, web/src/features/resources/registry/types.ts]
review_rounds: 0
---

## Goal
ADR-0037 §3-4: the generic action engine every CP4a action plugs into — kind items before the common ones, uniform
RO/RBAC gating (ACT-4), success/failure feedback naming object and cluster (ACT-6) and one modal shell that names the
cluster and environment (SAFE-1). No new user-visible action yet except the cluster display name in the delete modal.

## Scope
- In: `useKindActions` descriptor hook type + call site; `useResourceActions` takes `obj`; `useActionAccess` helper;
  `useResourceMutation`; `ResourceMutationModal`; `ClusterContextText`; `DeleteResourceModal` adopts
  `ClusterContextText` (display name) and the delete toast uses the display name; tests.
- Out: labels/annotations modals (T-0177), kind actions (T-0181/0182/0185).

## Contract / design notes
- `registry/types.ts`: `useKindActions?(args: KindActionArgs<T>): KindActions` with
  `KindActionArgs<T> = { cluster: string; obj: T; reviewByName: boolean }`,
  `KindActions = { items: ResourceActionItem[]; dialog: ReactNode }`.
- `ResourceActionItem.itemKey: string` (kind keys are kebab-case, unique per kind); common keys `edit-labels`,
  `edit-annotations`, `edit`, `delete`. Order: kind items, then common (`useCommonActions` order). `isSeparator`
  not used (OCP has none between groups in the kebab).
- `useResourceActions({ cluster, descriptor, obj, reviewByName, onDeleted })`: calls
  `(descriptor.useKindActions ?? noKindActions)(…)` unconditionally; `ResourceActionsMenu`/`ResourceRowActions` render
  under `key={modelKey(descriptor.model)}`. Returns `dialog` = kind dialog ?? common dialog (one open at a time).
- `useActionAccess(cluster, review, reviewByName)` → `DisabledActionProps` (checking → `isAriaDisabled` without
  tooltip; denied → reason), wrapping `useResourceAccess` (now verb + subresource, T-0174). Every mutating item uses it.
- `useResourceMutation<V, R>(cluster, { mutationFn, successMessage(vars, result): string, toastErrors?: boolean })`:
  TanStack `useMutation`; success toast `"<successMessage> on <display name>"`; `toastErrors` (modal-less actions)
  → danger toast title "<action> failed" body = `ApiError.detail` (never blank: fallback "The cluster returned no
  message."). Live data updates through the existing watch; also `invalidateQueries(k8sQueryKeys.get(...))`.
- `ResourceMutationModal({ title, cluster, namespace, objectName, kindLabel, isSaving, error, onSave, onClose, saveLabel?='Save', children })`:
  PF `Modal variant="small"` + `ModalHeader title` + `ModalBody` (starts with `ClusterContextText`, then children,
  then inline danger `Alert` with `error.detail`) + `ModalFooter` primary Save (`isLoading`) / link Cancel; a `<form>`
  so Enter saves. `ClusterContextText`: "<objectName> in <namespace> on **<display name>**" + `EnvironmentLabel isCompact`.
- Display name via `useAccessibleClusters()` (fallback: cluster name) in one helper `useClusterDisplayName(cluster)`.

## Context pack
- Docs: `FRONTEND.md` § UI conventions (modals, destructive actions); `UX.md` §9; ADR-0037 §3-4.
- Exemplars: `actions/useResourceActions.tsx` (whole file, ~100 lines — you will rewrite most of it);
  `actions/DeleteResourceModal.tsx` L40-80 (env label + bold cluster); `actions/useDeleteResource.ts` L37-60 (mutation + toast).
- Touch points: `actions/ResourceActionsMenu.tsx:24`, `actions/ResourceRowActions.tsx:19-30`, `ResourceActions.test.tsx`;
  `shared/ui` `disabledActionProps`, `EnvironmentLabel`, `useToast`.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/src/actions/hooks/useCommonActions.ts`
  L99-130 (labels/annotations/edit/delete order and labels).

## Acceptance criteria
- [ ] ACT-1 (engine): kind items render before Edit labels, Edit annotations, Edit <Kind>, Delete <Kind> in row and details menus (test with a stub kind hook).
- [ ] ACT-4 (engine): RO user/grant → mutating items aria-disabled with the UI-9 reason; RBAC denial → RBAC reason; no request sent (test).
- [ ] ACT-6 (engine): success toast names object and cluster display name; failure never blank (tests).
- [ ] SAFE-1: `ResourceMutationModal` and the delete modal show display name + environment label (test on a production cluster).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
