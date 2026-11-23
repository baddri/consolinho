---
id: T-0176
title: Kind actions, mutation feedback and the cluster-naming mutation modal shell
status: done
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
- [x] ACT-1 (engine): kind items render before Edit labels, Edit annotations, Edit <Kind>, Delete <Kind> in row and details menus (test with a stub kind hook).
- [x] ACT-4 (engine): RO user/grant → mutating items aria-disabled with the UI-9 reason; RBAC denial → RBAC reason; no request sent (test).
- [x] ACT-6 (engine): success toast names object and cluster display name; failure never blank (tests).
- [x] SAFE-1: `ResourceMutationModal` and the delete modal show display name + environment label (test on a production cluster).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: started; engine types in registry/types.ts, hooks + modal shell in actions/.

- 2026-11-23 frontend-engineer: done; gate green (lint, typecheck, 923 tests/80 files, build). Probe skipped: no new screen (delete modal copy only).

## Review
- 2026-11-23 frontend-architect, round 1: **APPROVE** (check-fe green: lint, typecheck, 923 tests/80 files, build).
  - Deviation 1 (`details/ResourceDetailsPage.tsx` passes `obj`): accepted, it follows from the `obj` contract.
  - Deviation 2 (`toastErrors: { action }`): accepted. A boolean can't produce the "<action> failed" title the ADR asks for.
  - Deviation 3 (ternary kind hook): safe. Both call sites wrap in `key={modelKey(model)}` (`ResourceActionsMenu.tsx:22`, `ResourceRowActions.tsx:20`) and a model maps to one registry descriptor, so the branch is fixed per instance. Any future direct caller of `useResourceActions` must key the same way, as its TSDoc says.
  - Deviation 4 (delete modal keeps OCP's sentence, no `ClusterContextText`): accepted. OCP parity wins, and SAFE-1 is still met (display name in bold plus the env label in the title).
  - Deviation 5 (labels/annotations to T-0177): accepted. T-0177 owns ACT-1..4 for those items.
  - Nit (optional): the ACT-1 AC checkbox lists Edit labels/annotations, which this task does not ship. Reword it as "(engine; labels/annotations in T-0177)".
  - Nit (optional): the TSDoc lines in `ResourceRowActions.tsx:14-15` and `DeleteResourceModal.tsx:25` run past 120 columns. Rewrap them.
- 2026-11-23 ux-designer, round 1 UX: **APPROVE** (mock UI :5235, alice on prod-eu-1 RO / staging-eu-1 RW, 1280 light).
  - Order: no kind hook ships yet, so the live menus show Edit Deployment, Delete Deployment (row kebab = details Actions); kind-first order checked in `KindActions.test.tsx` L71-94. Matches OCP `console-app/src/actions/providers/deployment-provider.ts` L40-61 (kind items, then labels, annotations, Edit, Delete; no separators). OK.
  - RO gating: Delete is `aria-disabled="true"` in row and details menus, tooltip "Your access to prod-eu-1 is read-only.", a forced click opens no dialog. Edit stays enabled (it opens YAML, as OCP's href action does). OK.
  - Delete modal: small, one close (header X), warning title "Delete Deployment?" + inline env label, body "...web in namespace shop on cluster **Staging EU 1**?", danger Delete + link Cancel. Matches OCP `public/components/modals/delete-modal.tsx` L108-200 plus the fleet cluster suffix. Toast "web deleted from Staging EU 1". OK.
  - Note (non-blocking, follow-up): the RO tooltip names the cluster by `name` (per CP2 spec "Your access to `<cluster>`" and the proxy 403 detail), while the modal and toast now use the display name. Consider moving UI-9 reasons to the display name in a later task so one screen never shows both forms.

## Handover notes
- Engine: `registry/types.ts` holds `ResourceActionItem` (`itemKey: string`), `KindActionArgs`, `KindActions`,
  `useKindActions?`; `useResourceActions({ cluster, descriptor, obj, reviewByName, onDeleted })` returns kind items, then common.
- Kind hook call: `descriptor.useKindActions ? descriptor.useKindActions(args) : noKindActions()` (a `?? noKindActions`
  reference trips `unbound-method`; `this: void` trips `no-invalid-void-type`). Safe: menu/row are keyed by `modelKey`.
- `useActionAccess(cluster, review, reviewByName)` -> `DisabledActionProps`; guard `onClick` on `isAriaDisabled`.
- `useResourceMutation(cluster, { model, mutationFn, successMessage, toastErrors? })`: vars extend `{ namespace, name }`
  (needed for the `get` invalidation, hence `model`). Deviation: `toastErrors` is `{ action: string }` (toast title
  "<action> failed"), not a boolean. `mutationErrorMessage(error)` gives the never-blank text.
- `ResourceMutationModal` error: inline `Alert` "An error occurred" (OCP `ErrorMessage` copy) + message. `kindLabel`
  prefixes `ClusterContextText`: "<Kind> <name> in <ns> on **<display>**" + env label.
- Delete modal keeps its OCP sentence (not `ClusterContextText`) but uses the display name; title env label unchanged.
- Common items are still Edit/Delete only: T-0177 adds `edit-labels`/`edit-annotations` between kind items and `edit`.
- Outside `paths`: `details/ResourceDetailsPage.tsx` one line (`ResourceActionsMenu` now takes `obj`).
