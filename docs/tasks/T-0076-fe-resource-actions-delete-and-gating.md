---
id: T-0076
title: Resource actions — useResourceAccess gating with reasons, row kebab, Actions menu, delete modal
status: done
owner: frontend-engineer
checkpoint: 2
depends_on: [T-0075]
paths: [web/src/features/resources/actions/, web/src/features/resources/list/ResourceTable.tsx, web/src/features/resources/details/ResourceHeader.tsx]
review_rounds: 0
---

## Goal
Honest permissions (US-8, UI-9) and the first generic write (UI-8, Q2): Edit YAML and Delete in the list row kebab
and the details Actions menu, disabled with the first applicable reason, and a delete confirmation that names the
cluster and its environment (SW-10).

## Scope
- From T-0070 review: SSAR (`useCanI`) reflects only the cluster RBAC of the assigned SA. Write actions must ALSO
  be gated on the grant's `accessMode` (ReadOnly) and the user's `isReadOnly`, with the matching reason text.
- In: `actions/{useResourceAccess.ts,ResourceActionsMenu.tsx,ResourceRowActions.tsx,DeleteResourceModal.tsx,useDeleteResource.ts}`,
  wiring into the list table rows and the details header slot.
- Out: YAML save gating UI (T-0077 consumes `useResourceAccess`), scale/restart/labels actions (CP4).
- Carried T-0075 review nit (optional): not-found action in `components/ResourceErrorState.tsx` as PF `Button component={Link}` instead of a bare `Link`.

## Contract / design notes
- BE: DELETE through the proxy (contract §1); denials arrive as 403 `Proxy.UserReadOnly` / `Proxy.ReadOnlyGrant`
  (ProblemDetails) or 403 `Kubernetes.Forbidden` (Status) — show `errorMessage(error)` in the modal. SSAR via
  `useCanI` (T-0071).
- `useResourceAccess(cluster: string, review: { verb: 'update' | 'delete'; model: K8sModel; namespace?: string; name?: string }):
  { isChecking: boolean; disabledReason: string | undefined }` — first applicable reason (UI-9):
  1. `useCurrentUser().data.isReadOnly` → "Your account is read-only."
  2. the cluster's `accessMode === 'readOnly'` in `useAccessibleClusters()` → "Your access to `<cluster>` is read-only."
  3. `useCanI` denied → "The service account for `<cluster>` cannot `<verb>` `<plural>` in `<ns>` (cluster RBAC)."
     (cluster-scoped: no "in `<ns>`").
  Reasons 1–2 need no SSAR (`enabled: false`). While checking: disabled, no tooltip (`isAriaDisabled` without
  `tooltipProps`). List rows pass no `name` (namespace-level SSAR, ADR-0022 §9) — only rendered rows mount the hook.
- Menu items: "Edit YAML" (always enabled — it opens the YAML tab, which explains read-only itself) and "Delete"
  (gated by `delete`). Row kebab = PF `ActionsColumn` with `disabledActionProps(reason)`; details = right-aligned PF
  `Dropdown` "Actions" with `DropdownItem`s using the same helper.
- `DeleteResourceModal` on `ConfirmModal`: title "Delete `<Kind>` `<name>`?", `titleLabel` = `EnvironmentLabel` of the
  cluster, body names namespace and cluster ("… in project `shop` on `prod-eu-1`"), `variant="danger"`,
  `typeToConfirm={name}` when `descriptor.deleteRequiresName`, `isPending`, `error`. Success → toast "`<name>` deleted
  from `<cluster>`"; from details navigate to the list (`resourcePath`), in lists the watch removes the row.
- `useDeleteResource(cluster, model)`: `useMutation` over `k8sDelete`; on success remove the `get` key
  (`k8sQueryKeys.get`), never refetch lists (watch).

## Context pack
- Docs: spec §4.8 UI-8, UI-9, §5 "Components"; ADR-0014 (permission-aware UI), ADR-0015 §6–7 (mutation feedback,
  confirm modals), ADR-0022 §9.
- Exemplars: `web/src/features/admin/clusters/DeleteClusterModal.tsx:DeleteClusterModal` (ConfirmModal + typeToConfirm +
  env label), `web/src/features/admin/clusters/ClusterRow.tsx:L24-L57` (ActionsColumn + disabled reasons),
  `web/src/features/admin/clusters/ClusterActionsDropdown.tsx:ClusterActionsDropdown` (header Actions dropdown),
  `web/src/features/admin/useAdminAccess.ts` (reason-combining hook style).
- Touch points: `web/src/shared/ui/ActionButton.tsx:disabledActionProps`, `web/src/shared/ui/ConfirmModal.tsx:ConfirmModalProps`,
  `web/src/shared/ui:EnvironmentLabel|useToast`, `web/src/features/auth:useCurrentUser`,
  `web/src/features/cluster-context:useAccessibleClusters|useActiveCluster`, `web/src/shared/k8s:useCanI|k8sDelete|k8sQueryKeys`,
  `web/src/features/resources/list/ResourceTable.tsx` and `details/ResourceHeader.tsx` (slots from T-0073/T-0075).
  Personas: ines (read-only user), alice on prod-eu-1 (RO grant), carol on prod-eu-1 (RW grant, `fleet-edit` profile →
  can't delete projects), admin on dev-1 (RW, `fleet-edit`).

## Acceptance criteria
- [x] QG-3 tooltips for all three reasons: ines → "Your account is read-only."; alice/prod-eu-1 → "Your access to
      `prod-eu-1` is read-only."; carol deleting a project on prod-eu-1 → the RBAC sentence; no SSAR sent for 1–2.
- [x] While the SSAR is pending, Delete is disabled without a tooltip.
- [x] UI-8: deleting a pod from the list removes the row (watch) and toasts; from details returns to the list;
      a server 403 (`server.use`) shows its `detail` in the modal; deleting a project requires typing its name; the
      modal names namespace, cluster and environment label.
- [x] Two rows in the same namespace trigger one SSAR (dedupe).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 frontend-engineer: started; actions/ hooks + menus + delete modal, wiring into ResourceTable and details header.
- 2026-11-20 frontend-engineer: done. Gate: lint/typecheck/build ok, 651/652 tests; the 1 failure is pre-existing at HEAD.
- 2026-11-20 frontend-engineer: round 1 fixes — toast/onDeleted moved into `useDeleteResource` options (survive unmount),
  404 `Kubernetes.NotFound` on DELETE = success, race tests added, kinds.test 'Actions' header, real `projectDescriptor`
  test; scope extension: SW-9 test in `clusterContext.test.tsx` now awaits the switcher's new name/focus. Gate green (665).

## Review
- 2026-11-20 frontend-architect: **CHANGES_REQUESTED** (round 1). Full gate on HEAD (T-0074 + T-0078 merged):
  lint/typecheck/build ok, tests 658/663. Gating order, no SSAR for reasons 1–2, SSAR fail-open (`useCanI`), and
  namespace-level SSAR only for mounted page rows (no N+1 on 2,000 rows) are all correct. The a11y of the kebab and
  Actions dropdown (sr-only header, aria-disabled + tooltip) is fine.
  - `web/src/features/resources/registry/kinds/kinds.test.tsx:22` — 4 failures (deployments, services, projects,
    namespaces): the column-header lists don't include the new sr-only "Actions" header. This is a merge consequence of
    T-0078 — add 'Actions' to the expected lists, as in `ResourceListPage.test.tsx`.
  - `actions/DeleteResourceModal.tsx:42-50` — the toast and `onDeleted` are `mutate()`-level callbacks, which TanStack
    skips once the observer unmounts. Two ways that happens: in lists, the watch's DELETED event removes the row (and
    its dialog); in details, `ResourceDetailsPage` drops `actions` when the get turns 404. Either can arrive before the
    DELETE response (immediate deletes such as ConfigMaps, Services). Result: no toast, and details stays on "not found"
    instead of returning to the list. Fix: run toast + `onDeleted` from `useMutation` options in `useDeleteResource`
    (e.g. `useDeleteResource(cluster, model, { onDeleted })`), and add a test where the object disappears from the mock
    before the DELETE response resolves.
  - `cluster-context/clusterContext.test.tsx:258` (not this task) — SW-9 "keeps the path and filters" failed again
    under the full gate. It's a flake: an immediate `getByRole` for the new switcher name/focus right after the path
    `waitFor`. File a bug: wrap it in `waitFor`/`findByRole`.
- Nits (optional):
  - `actions/ResourceActions.test.tsx:195` — use the real `projectDescriptor` (and/or `namespaceDescriptor`) instead of
    an ad-hoc descriptor, so the test guards the real `deleteRequiresName` flag.
  - A 404 on DELETE (already gone) shows as an error in the modal; it could be treated as success (toast + close).
  - All-namespaces lists send one SSAR per distinct namespace on the current page (bounded by page size). This is
    acceptable per ADR-0022 §9.
- 2026-11-20 frontend-architect: **APPROVE** (round 2). `scripts/check-fe.sh` green (665/665). All required findings are
  resolved:
  - The toast, `onDeleted` and `onClose` run from `useMutation` options in `useDeleteResource`, and the two new race
    tests cover the list and details cases.
  - `kinds.test.tsx` expects 'Actions'.
  - SW-9 now waits with `findByRole`/`waitFor`.
  - "Already gone" is matched on `code === 'Kubernetes.NotFound'` (plus status), so the proxy's `Proxy.NotAvailable`
    404 still errors.
  - The type-to-confirm test uses the real `projectDescriptor`.

## Handover notes
- `actions/useResourceAccess` (reasons 1–3, SSAR only when FleetConsole gates pass; exported reason builders) — T-0077 reuses it with `verb: 'update'`.
- `actions/useResourceActions` builds Edit YAML + Delete items and owns the `DeleteResourceModal`; `ResourceRowActions` (kebab `<Td>`) and `ResourceActionsMenu` (details dropdown) render them.
- Wiring outside `paths` (minimal): `ResourceListPage` passes `rowActions` and `colSpan + 1`; `ResourceDetailsPage` passes `actions` to `ResourceHeader` (only once the object loaded); `ResourceListPage.test` column lists gain 'Actions'. `ResourceHeader` needed no change.
- `ResourceTable` gains optional `rowActions` (+ sr-only "Actions" header).
- Toast + `onDeleted` live in `useDeleteResource` options (watch DELETED may unmount the dialog first); 404 `Kubernetes.NotFound` counts as deleted, `Proxy.NotAvailable` 404 does not.
- Carried nit skipped: PF `Button component={Link} to=…` fails typecheck (`to` not in ButtonProps); needs a wrapper — left as is.
- SW-9 test fixed by awaiting (`findByRole` + `waitFor` focus); it was a timing race, not a product bug.
