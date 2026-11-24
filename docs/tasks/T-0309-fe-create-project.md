---
id: T-0309
title: Create Project modal and Projects/Namespaces tab parity (PRJ-1, PRJ-2, SAFE5-2)
status: todo
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0300]
paths: [web/src/features/resources/registry/kinds/projects.tsx, web/src/features/resources/registry/kinds/namespaces.tsx, web/src/features/resources/projects, web/src/features/admin/audit/auditActionLabels.ts, web/src/features/admin/audit/auditActionLabels.test.ts]
review_rounds: 0
---

## Goal
Marco creates a project from the Projects list exactly as in OCP ("Create Project" → modal → lands on the new
project), on the cluster he has selected, and the audit log reads "Create Project".

## Scope
- In: `ListActions` button on the Projects list, modal, mutation, access gating, audit label rule, tab set parity.
- Out: Create Namespace (vanilla clusters; backlog); Project Overview/Workloads/RoleBindings tabs (parity gaps).

## Contract / design notes
- **`projects/CreateProjectButton.tsx`**: `CreateProjectButton({ cluster }: { cluster: string })`, wired as the Projects
  descriptor's `ListActions` (slot from T-0300). PF `Button variant="primary"` "Create Project" (OCP copy). Gating via
  `useActionAccess(cluster, { model: ProjectRequestModel, verb: 'create' })`: RO user / RO grant / RBAC-denied →
  **disabled with the reason tooltip** (SAFE5-2, never hidden; same tooltip pattern as the kebab items). The Projects
  page only exists where `project.openshift.io` is served, so no extra discovery check.
- **`projects/CreateProjectModal.tsx`** on `ResourceMutationModal` (SAFE5-1 cluster name + env label): title
  "Create Project", `saveLabel="Create"`, description OCP's "An OpenShift project is an alternative representation of a
  Kubernetes namespace." (omit OCP's "Learn more about working with projects" doc link — product docs link-out is a UX
  call, record in Work log for T-0310). Fields (react-hook-form + zod, `projects/createProjectSchema.ts`): Name
  (required, DNS-1123 label ≤63, OCP help text "a lowercase RFC 1123 label…" copied from `CreateProjectModal.tsx`),
  Display name, Description (`TextArea`). `elementToFocus` = Name.
- **Mutation** `projects/useCreateProject.ts`: `k8sCreate(cluster, ProjectRequestModel, { metadata: { name },
  displayName?, description? })` via `useResourceMutation` (invalidate the Projects list); on success toast
  *(fleet, names project + cluster)* and `navigate` to the Project details URL (build with the registry's URL helper,
  don't hand-build paths). Errors (409 AlreadyExists, 403) inline in the modal with the server message (OCP shows the
  error; our modals show the Status message — keep the shared behaviour).
- **PRJ-1 tabs:** set `hasEventsTab: false` on Projects **and** Namespaces (OCP `namespace.tsx` L1120–1153 has no
  Events tab on either). Record in Work log.
- **Audit label** (`admin/audit/auditActionLabels.ts`, T-0220 rule table): add rule create `projectrequests` →
  "Create Project" with a test. No other audit rules in this task. SAFE5-5 says "Created Project"; the T-0220 map
  uses imperative labels ("Create <Kind>") — keep the map's tense, note the deviation in the Work log.
- Tests in `projects/createProject.test.tsx`: RW creates `team-new` → lands on its details, toast names cluster; 409
  shows inline error; RO sees the button disabled with the read-only reason; invalid name blocks Save; Projects and
  Namespaces details have no Events tab.

## Context pack
- Docs: ADR-0037 §3–4; FRONTEND.md § Forms; `actions/useResourceAccess.ts` (`USER_READ_ONLY_REASON`,
  `readOnlyGrantReason`, `rbacDeniedReason`).
- Exemplars: `workloads/scale/ConfigureCountModal.tsx` (RHF/zod in `ResourceMutationModal`);
  `workloads/scale/useSetParallelism.ts` (`useResourceMutation`); `auditActionLabels.ts` + its test (rule shape).
- Touch points: `registry/types.ts:ListActions` (T-0300); `shared/k8s:k8sCreate`, `ProjectRequestModel` (T-0300);
  mock ProjectRequest POST 201/409/RO-403 (T-0300).
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-shared/src/components/modals/CreateProjectModal.tsx`,
  `public/components/namespace.tsx` (L1120–1153 page tabs, `ProjectsPage` create button).

## Acceptance criteria
- [ ] PRJ-2: RW creates a project; lands on its details; toast names project + cluster; 409 inline.
- [ ] SAFE5-1/2: modal shows cluster + env label; RO / denied → button disabled with reason, never hidden.
- [ ] PRJ-1: no Events tab on Project/Namespace details.
- [ ] Audit label "Create Project" rule + test.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
