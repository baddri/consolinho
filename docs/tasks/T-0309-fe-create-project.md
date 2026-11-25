---
id: T-0309
title: Create Project modal and Projects/Namespaces tab parity (PRJ-1, PRJ-2, SAFE5-2)
status: done
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0300]
paths: [web/src/features/resources/registry/kinds/projects.tsx, web/src/features/resources/registry/kinds/namespaces.tsx, web/src/features/resources/projects, web/src/features/admin/audit/auditActionLabels.ts, web/src/features/admin/audit/auditActionLabels.test.ts]
review_rounds: 1
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
- [x] PRJ-2: RW creates a project; lands on its details; toast names project + cluster; 409 inline.
- [x] SAFE5-1/2: modal shows cluster + env label; RO / denied → button disabled with reason, never hidden.
- [x] PRJ-1: no Events tab on Project/Namespace details.
- [x] Audit label "Create Project" rule + test.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: started; read ADR-0037 §3–4 exemplars, OCP `CreateProjectModal.tsx` + `namespace.tsx`.
- 2026-11-25 frontend-engineer: done. PRJ-1 `hasEventsTab: false` on Projects + Namespaces (OCP L1120–1153). Audit rule
  reads "Create Project" (map's imperative tense; SAFE5-5 says "Created Project"). For T-0310: OCP's "Learn more about
  working with projects" doc link omitted; OCP's Name `labelHelp` popover shown as helper text (TextField has no labelHelp).
  Button gates via `useResourceAccess` + `ActionButton` (`useActionAccess` returns menu-item props). Full gate: only
  `mocks/k8s.test.ts` lab-1 groups fails, from other WIP adding 3 API groups to `shared/k8s/models.ts`. Probe: 0 mismatches.

## Review
- 2026-11-25 ux-designer, round 1: **CHANGES_REQUESTED**. Probe can't open modals (no clicks), so I measured with a scratch Playwright script on mock `dev-1?mockUser=admin` and compared it with OCP source `packages/console-shared/src/components/modals/CreateProjectModal.tsx` L113–203. Matches OCP: `ModalVariant.small` (560px), one close control, title "Create Project", field order Name* / Display name / Description (TextArea vertical), focus on Name, footer Create (primary) + Cancel (link).
  - Create Project modal — the intro sentence is in `ModalHeader description`, which renders 12px in the subtle colour (rgb 77,77,77) directly under the title. OCP puts it in `ModalBody` as `<Content component="p">` (14px, regular text colour, above the form), L120–123. (OCP's configure-count modal uses the header description; Create Project doesn't.) — Fix: drop `description=` and render `<Content component="p">An OpenShift project is…</Content>` in the body. The simplest way is as the first child. If the frontend architect agrees, add a ResourceMutationModal prop that puts it above ClusterContextText, which matches OCP's order more closely.
- Deviations judged:
  - Name rules as helper text instead of a `FieldLevelHelp` popover: accepted for now; the text is OCP's verbatim. Follow-up for T-0310: shared `TextField` gets PF `FormGroup labelHelp`, then move the rule into a popover and add OCP's 2nd sentence ("You must create a Namespace to be able to create projects that begin with 'openshift-', 'kubernetes-', or 'kube-'.", L144–146).
  - "Learn more about working with projects" omitted: accepted. OCP hides it too on managed clusters (`!isManaged()`, L124), and we have no product docs to link to.
  - Cluster context line ("Project <name> on **Development 1** `dev`"): accepted. It's a fleet invention required by SAFE5-1 and uses OCP's Content p + compact label style. The 40px gap below it is the known T-0310 follow-up.
- 2026-11-25 frontend-architect, round 1: **APPROVE**. `check-fe.sh src/features/resources/projects` green (6/6).
  Deviations accepted: `ActionButton` + `useResourceAccess` (`useActionAccess` returns menu-item props; same reasons,
  same shared tooltip pattern as admin buttons); Name rules as helper text and no "Learn more" link — both logged for
  T-0310 (adding `labelHelp` to shared `TextField` is outside this task's paths).
  Optional nits:
  - `projects/useCreateProject.ts:14` — `Omit<…,'name'>` then re-adding `name: string` is a no-op; `CreateProjectValues & MutationTarget` reads simpler.
  - `projects/useCreateProject.ts:47` — list invalidation inside `mutationFn`; an `onSuccess` would separate I/O from cache work (watch covers it anyway).
  - `registry/kinds/projects.tsx:14` — TSDoc line exceeds 120 cols; rewrap.

## Handover notes
- New `web/src/features/resources/projects/`: `CreateProjectButton` (descriptor `ListActions`), `CreateProjectModal`
  (RHF + zod on `ResourceMutationModal`; context line shows the typed name + cluster + env label), `useCreateProject`
  (POST ProjectRequest via `useResourceMutation`, invalidates the Projects list, toast "Project <n> created on <cluster>"),
  `createProjectSchema` (`dnsLabel(63)`), `createProject.test.tsx` (create+navigate, 409, invalid name, RO tooltip, tabs).
- Navigation to details happens in the modal's `mutate` onSuccess via `resourcePath`.
- Not covered by a test: RBAC-denied (not RO) reason; same `useResourceAccess` path as other actions.
- Probe can't open modals (no clicks); only the heading button was probed against OCP `item-create`.
- Round 2 (orchestrator): intro sentence moved from ModalHeader description into the body as `Content p` (UX finding); projects checks green. APPROVED.
