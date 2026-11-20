---
id: T-0076
title: Resource actions — useResourceAccess gating with reasons, row kebab, Actions menu, delete modal
status: todo
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
- In: `actions/{useResourceAccess.ts,ResourceActionsMenu.tsx,ResourceRowActions.tsx,DeleteResourceModal.tsx,useDeleteResource.ts}`,
  wiring into the list table rows and the details header slot.
- Out: YAML save gating UI (T-0077 consumes `useResourceAccess`), scale/restart/labels actions (CP4).

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
- [ ] QG-3 tooltips for all three reasons: ines → "Your account is read-only."; alice/prod-eu-1 → "Your access to
      `prod-eu-1` is read-only."; carol deleting a project on prod-eu-1 → the RBAC sentence; no SSAR sent for 1–2.
- [ ] While the SSAR is pending, Delete is disabled without a tooltip.
- [ ] UI-8: deleting a pod from the list removes the row (watch) and toasts; from details returns to the list;
      a server 403 (`server.use`) shows its `detail` in the modal; deleting a project requires typing its name; the
      modal names namespace, cluster and environment label.
- [ ] Two rows in the same namespace trigger one SSAR (dedupe).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
