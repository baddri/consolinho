---
id: T-0385
title: Create Namespace modal on the Namespaces list where project.openshift.io isn't served (NSC-1/2)
status: todo
owner: frontend-engineer
checkpoint: 5.5
depends_on: [T-0378]
paths: [web/src/features/resources/namespaces, web/src/features/resources/registry/kinds/namespaces.tsx, web/src/features/resources/actions/EditLabelsModal.tsx, web/src/features/resources/actions/EditLabelsModal.module.css, web/src/features/resources/actions/LabelsInput.tsx, web/src/features/resources/actions/LabelsInput.module.css, web/src/features/resources/actions/EditMetadataModals.test.tsx]
review_rounds: 0
---

## Goal
Kubernetes users can't create Projects; give the Namespaces list OCP's "Create Namespace" heading button and minimal
modal (Name + Labels, spec NSC-1, Q5) gated like Create Project (NSC-2), so they don't leave for kubectl.

## Scope
- In: button, modal, mutation hook, schema; extract the labels chip input from `EditLabelsModal` into a shared
  `LabelsInput` used by both.
- Out: default network policy (spec NSC-1); Create Namespace on OpenShift (button hidden where Projects are served).

## Contract / design notes
- New folder `web/src/features/resources/namespaces/` mirroring `projects/`:
  - `createNamespaceSchema.ts`: `{ name: dnsLabel(63, { requiredMessage: 'Name is required.' }), labels: z.array(z.string()) }`;
    labels validated with `labelEntryErrors`/`parseLabel` (`actions/labelValidation`).
  - `useCreateNamespace(cluster)`: `useResourceMutation(cluster, { model: NamespaceModel, mutationFn, successMessage:
    ({ name }) => \`Namespace ${name} created\` })`; POST `k8sCreate(cluster, NamespaceModel, undefined, { apiVersion: 'v1',
    kind: 'Namespace', metadata: { name, labels } })` (labels omitted when empty); invalidate
    `k8sQueryKeys.list(cluster, NamespaceModel)`. Mutation guard + audit come from the proxy (as any create).
  - `CreateNamespaceModal({ cluster, onClose })`: shared `ResourceMutationModal`, `variant="small"`, title
    "Create Namespace", primary "Create", secondary "Cancel" (spec §5); Name `TextField` required + focused with OCP's
    name help; Labels via `LabelsInput` (placeholder `app=frontend`); API error inline as danger `Alert` (the shared
    modal's `error`). Success → navigate to `resourcePath(cluster, NamespaceModel, { name })`.
  - `CreateNamespaceButton({ cluster })`: returns `null` while discovery is pending or when `ProjectModel` is served;
    else as `CreateProjectButton`: `useResourceAccess(cluster, { verb: 'create', model: NamespaceModel })`,
    `ActionButton` primary "Create Namespace", disabled with the reason / aria-disabled while checking.
- `namespaceDescriptor.ListActions = CreateNamespaceButton`.
- **NSC-2 read-only:** follow the Create Project precedent (SAFE5-2, UI-9): visible, disabled with
  `USER_READ_ONLY_REASON` / `readOnlyGrantReason`. The spec says "hidden" for read-only but also "as Create Project";
  precedent wins for consistency (flagged to the PO, see T-0387).
- **`LabelsInput`** (`actions/LabelsInput.tsx`): controlled `{ id, entries: string[], onChange(entries), text,
  onTextChange, isInvalid, helperId, autoFocus? }` or self-contained with `entries`/`onChange` — engineer's choice,
  but `EditLabelsModal` must use it with unchanged behaviour (its tests stay green, untouched or only import changes).

## Context pack
- Docs: `FRONTEND.md` § Forms (ADR-0015), § Session and permissions (ADR-0014).
- Exemplars (copy shape): `web/src/features/resources/projects/CreateProjectButton.tsx`, `CreateProjectModal.tsx`
  (L29-86), `useCreateProject.ts`, `createProjectSchema.ts`, `createProject.test.tsx` (modal tests incl. 403/409 inline).
- Touch points: `actions/EditLabelsModal.tsx:EditLabelsModal` (chip input L130-175, key handling ~L80-97, `save` L99);
  `actions/labelValidation.ts:parseLabel`, `labelEntryErrors`, `formatLabel`; `actions/useResourceAccess.ts:useResourceAccess`;
  `actions/ResourceMutationModal`; `registry/kinds/namespaces.tsx:namespaceDescriptor`; `registry/types.ts` `ListActions` (L267);
  `@/shared/k8s` `NamespaceModel`, `ProjectModel`, `useK8sDiscovery`, `k8sCreate`, `k8sQueryKeys`.
- MSW: generic `create` in `web/src/mocks/k8s/apiServer.ts` (L322); `admin` profile may create namespaces, `edit` may not
  (`rbac.ts` `CLUSTER_SCOPED`) — use `prod-k8s-1` (admin readWrite, alice readOnly grant) for allowed / read-only cases.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-shared/src/components/modals/CreateNamespaceModal.tsx`
  (fields, copy, labels via `SelectorInput`); list button `public/components/namespace.tsx` (~L470 `createNamespaceModal`).

## Acceptance criteria
- [ ] NSC-1: on `prod-k8s-1` Namespaces list shows "Create Namespace"; on an OpenShift cluster it doesn't.
- [ ] NSC-1: modal title/buttons as spec; Name focused, required, DNS-1123 errors; labels `a=b` chips; create sends the
  labels; success navigates to the namespace details and toasts; 409/403 shown inline in the modal.
- [ ] NSC-2: read-only grant (alice on `prod-k8s-1`) → disabled with the read-only reason; SSAR denial (an `edit`
  credential) → disabled with the RBAC reason; aria-disabled while checking.
- [ ] `EditLabelsModal` behaviour unchanged (existing tests green).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
